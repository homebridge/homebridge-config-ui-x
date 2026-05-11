import { inject, Injectable } from '@angular/core'
import { Observable, ReplaySubject } from 'rxjs'
import { io as ioFn, Socket } from 'socket.io-client'

import { AuthService } from '@/app/core/auth/auth.service'
import { environment } from '@/environments/environment'

export interface IoNamespace {
  connected?: ReplaySubject<void>
  socket: Socket
  request: (resource: string, payload?: string | Record<string, any> | Array<any>) => Observable<any>
  end?: () => void
}

@Injectable({
  providedIn: 'root',
})
export class WsService {
  private $auth = inject(AuthService)

  private namespaceConnectionCache: Record<string, IoNamespace> = {}

  /**
   * Wrapper function to reuse the same connection.
   *
   * `connected` is a `ReplaySubject(1)`: the most recent "socket is ready"
   * emission is buffered so subscribers that attach synchronously after this
   * method returns still receive it. This is what lets callers safely do:
   *
   *     io = $ws.connectToNamespace('foo')
   *     io.connected.subscribe(() => io.socket.emit('start'))
   *
   * …without an additional `if (io.socket.connected) emit('start')` fallback —
   * adding both makes the `emit` fire twice on cache-hit (see #2806).
   *
   * @param namespace
   */
  public connectToNamespace(namespace: string): IoNamespace {
    if (this.namespaceConnectionCache[namespace]) {
      /* connection to namespace already exists */
      const io: IoNamespace = this.namespaceConnectionCache[namespace]
      io.connected = new ReplaySubject<void>(1)

      // If the socket is already connected, signal ready immediately — the
      // ReplaySubject buffer ensures synchronously-attached subscribers receive
      // this value once they subscribe.
      if (io.socket.connected) {
        io.connected.next()
      }

      // Watch for re-connections, and broadcast
      io.socket.on('connect', () => {
        io.connected!.next()
      })

      // Define end function
      io.end = () => {
        io.socket.emit('end')
        io.socket.removeAllListeners()
        io.connected!.complete()
      }

      return this.namespaceConnectionCache[namespace]
    } else {
      /* first time connecting to namespace */
      const io = this.establishConnectionToNamespace(namespace)
      io.connected = new ReplaySubject<void>(1)

      // Wait for the connection and broadcast when ready
      io.socket.on('connect', () => {
        io.connected!.next()
      })

      // Define end function
      io.end = () => {
        io.socket.emit('end')
        io.socket.removeAllListeners()
        io.connected!.complete()
      }

      // Cache the connection
      this.namespaceConnectionCache[namespace] = io
      return io
    }
  }

  public getExistingNamespace(namespace: string): IoNamespace {
    return this.namespaceConnectionCache[namespace]
  }

  /**
   * Establish a connection to the namespace
   * @param namespace
   */
  private establishConnectionToNamespace(namespace: string): IoNamespace {
    const socket: Socket = ioFn(`${environment.api.socket}/${namespace}`, {
      query: {
        token: this.$auth.token,
      },
    })

    const request = (resource: string, payload: any): Observable<any> => new Observable((observer) => {
      socket.emit(resource, payload, (resp: any) => {
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
