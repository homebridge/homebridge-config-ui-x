import { inject, Injectable } from '@angular/core'
import { Observable, Subject } from 'rxjs'
import { io as ioFn, Socket } from 'socket.io-client'

import { AuthService } from '@/app/core/auth/auth.service'
import { environment } from '@/environments/environment'

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
  private $auth = inject(AuthService)

  private namespaceConnectionCache = {}
  private isHandlingAuthError = false

  /**
   * Wrapper function to reuse the same connection
   * @param namespace
   */
  public connectToNamespace(namespace: string): IoNamespace {
    if (this.namespaceConnectionCache[namespace]) {
      /* connection to namespace already exists */
      const io: IoNamespace = this.namespaceConnectionCache[namespace]
      io.connected = new Subject()

      // Broadcast to subscribers that the connection is ready
      if (io.socket.connected) {
        io.connected.next(undefined)
      }

      // Watch for re-connections, and broadcast
      io.socket.on('connect', () => {
        io.connected.next(undefined)
      })

      // Define end function
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

      // Wait for the connection and broadcast when ready
      io.socket.on('connect', () => {
        io.connected.next(undefined)
      })

      // Define end function
      io.end = () => {
        io.socket.emit('end')
        io.socket.removeAllListeners()
        io.connected.complete()
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

    // Handle server-initiated disconnects (e.g. WsGuard rejecting an expired token).
    // Socket.io does NOT auto-reconnect for server disconnects, so without this
    // the UI would show an infinite spinner.
    socket.on('disconnect', (reason: string) => {
      if (reason === 'io server disconnect') {
        this.handleConnectionAuthError()
      }
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

  /**
   * Handle a WebSocket auth error by attempting to refresh the session.
   * If refresh succeeds, reload to reconnect sockets with the new token.
   * If refresh fails (401), the HTTP interceptor will handle logout.
   */
  private handleConnectionAuthError() {
    if (this.isHandlingAuthError) {
      return
    }
    this.isHandlingAuthError = true

    this.$auth.refreshSession()
      .then(() => {
        // Token refreshed successfully, reload to reconnect sockets with new token
        window.location.reload()
      })
      .catch(() => {
        // Refresh failed — if it was a 401, the HTTP interceptor already handles
        // logout + reload. For other errors, explicitly logout.
        this.$auth.logout()
      })
  }
}
