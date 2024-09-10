import { AuthService } from '@/app/core/auth/auth.service'
import { environment } from '@/environments/environment'
import { Injectable } from '@angular/core'
import { Observable, Subject } from 'rxjs'
import { io as ioFn, Socket } from 'socket.io-client'

export interface IoNamespace {
  connected?: Subject<any>
  socket: Socket
  request: (resource: string, payload?: string | Record<string, any> | Array<any>) => Observable<any>
  end?: () => void
}

@Injectable({
  providedIn: 'root',
})
export class WsService {
  private namespaceConnectionCache = {}

  constructor(
    private $auth: AuthService,
  ) {}

  /**
   * Wrapper function to reuse the same connecting
   *
   * @param namespace
   */
  public connectToNamespace(namespace: string): IoNamespace {
    if (this.namespaceConnectionCache[namespace]) {
      /* connection to namespace already exists */
      const io: IoNamespace = this.namespaceConnectionCache[namespace]
      io.connected = new Subject()

      // broadcast to subscribers that the connection is ready
      setTimeout(() => {
        if (io.socket.connected) {
          io.connected.next(undefined)
        }
      })

      // watch for re-connections, and broadcast
      io.socket.on('connect', () => {
        io.connected.next(undefined)
      })

      // define end function
      io.end = () => {
        io.socket.emit('end')
        io.socket.removeAllListeners()
        io.connected.complete()
      }

      return this.namespaceConnectionCache[namespace]
    } else {
      /* first time connecting to namespace */
      const io = this.establishConnectionToNamespace(namespace)
      io.connected = new Subject()

      // wait for the connection and broadcast when ready
      io.socket.on('connect', () => {
        io.connected.next(undefined)
      })

      // define end function
      io.end = () => {
        io.socket.emit('end')
        io.socket.removeAllListeners()
        io.connected.complete()
      }

      // cache the connection
      this.namespaceConnectionCache[namespace] = io
      return io
    }
  }

  public getExistingNamespace(namespace: string): IoNamespace {
    return this.namespaceConnectionCache[namespace]
  }

  /**
   * Establish a connection to the namespace
   *
   * @param namespace
   */
  private establishConnectionToNamespace(namespace: string): IoNamespace {
    const socket: Socket = ioFn(`${environment.api.socket}/${namespace}`, {
      query: {
        token: this.$auth.token,
      },
    })

    const request = (resource: string, payload): Observable<any> => new Observable((observer) => {
      socket.emit(resource, payload, (resp) => {
        if (typeof resp === 'object' && resp.error) {
          observer.error(resp)
        } else {
          observer.next(resp)
        }
        observer.complete()
      })
    })

    return {
      socket,
      request,
    }
  }
}
