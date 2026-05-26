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

  constructor() {
    // When the access token is rotated (refreshSession), update the cached
    // sockets' handshake query so the next (re)connect uses the live token
    // instead of replaying the one captured at socket creation time.
    this.$auth.tokenRotated.subscribe(() => this.rotateTokenOnCachedSockets())
  }

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
      // Return the cached IoNamespace unchanged. Reassigning `io.connected`
      // or rebinding `on('connect')` here would orphan earlier subscribers
      // on the previous ReplaySubject and stack a new `connect` listener on
      // every call — eventually tripping MaxListenersExceededWarning and
      // double-emitting on reconnect.
      return this.namespaceConnectionCache[namespace]
    }

    /* first time connecting to namespace */
    const io = this.establishConnectionToNamespace(namespace)
    io.connected = new ReplaySubject<void>(1)

    // Wait for the connection and broadcast when ready
    io.socket.on('connect', () => {
      io.connected!.next()
    })

    // Define end function. We deliberately do NOT call removeAllListeners()
    // or complete() the shared `connected` ReplaySubject here — the
    // namespace is cached and shared across multiple components (e.g. the
    // `status` socket feeds StatusComponent and every status widget;
    // `child-bridges` feeds accessories, plugins, plugin-card). Wiping
    // listeners or completing the subject when one consumer closes would
    // silence every other consumer. Each consumer must therefore manage
    // its own listener teardown.
    io.end = () => {
      io.socket.emit('end')
    }

    // Cache the connection
    this.namespaceConnectionCache[namespace] = io
    return io
  }

  private rotateTokenOnCachedSockets(): void {
    const newToken = this.$auth.token
    for (const ns of Object.values(this.namespaceConnectionCache)) {
      const opts = ns.socket?.io?.opts as { query?: Record<string, any> } | undefined
      if (opts?.query && typeof opts.query === 'object') {
        opts.query.token = newToken
      }
      // Force a reconnect so the next handshake carries the new token.
      // Long-lived sockets would otherwise keep replaying the original
      // token on every reconnect, leaving rotated/revoked tokens stuck on
      // disconnected dashboards.
      if (ns.socket.connected) {
        ns.socket.disconnect().connect()
      }
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
      reconnectionAttempts: 10,
      reconnectionDelayMax: 30000,
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
