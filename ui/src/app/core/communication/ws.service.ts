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

  // There is deliberately no "push the rotated token onto cached sockets" step.
  // The `auth` callback in establishConnectionToNamespace is re-evaluated by
  // socket.io on every (re)connect, so a rotated token is picked up on its own.
  // Forcing open sockets to reconnect on rotation is not needed either: WsGuard
  // re-verifies the JWT and re-reads the user record on every message, so an
  // expired or revoked token stops working on an already-open socket regardless.

  public getExistingNamespace(namespace: string): IoNamespace {
    return this.namespaceConnectionCache[namespace]
  }

  /**
   * Establish a connection to the namespace
   * @param namespace
   */
  private establishConnectionToNamespace(namespace: string): IoNamespace {
    const socket: Socket = ioFn(`${environment.api.socket}/${namespace}`, {
      // Sent in the handshake payload rather than the URL. A token in the query
      // string is recorded by reverse proxies, access logs and monitoring, and
      // stays a usable bearer credential until it expires.
      //
      // ⚠️ Callback form, not a plain object: socket.io calls this on every
      // (re)connect, so the handshake always carries the token that is current
      // at that moment. A plain object is captured once when the socket is
      // built, and the token is loaded asynchronously now (see token-store.ts),
      // so a socket created during bootstrap would freeze `null` in its
      // handshake and be rejected by WsGuard on every retry for the life of the
      // page — which showed up as a status page stuck on its spinner.
      auth: (cb: (data: Record<string, any>) => void) => cb({ token: this.$auth.token }),
      reconnectionAttempts: 10,
      reconnectionDelayMax: 30000,
    })

    const request = (resource: string, payload: any): Observable<any> => new Observable((observer) => {
      socket.emit(resource, payload, (resp: any) => {
        // The null check matters: typeof null is 'object', so without it a
        // null acknowledgement would throw reading `.error` inside the callback
        if (resp && typeof resp === 'object' && resp.error) {
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
