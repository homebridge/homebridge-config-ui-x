import type { IoNamespace } from '@/app/core/communication/ws.service'
import type { Socket } from 'socket.io-client'
import type { Mock } from 'vitest'

import { Observable, ReplaySubject } from 'rxjs'
import { vi } from 'vitest'

type Handler = (...args: any[]) => void
type AckResponder = (payload: any) => any

export interface FakeSocket {
  connected: boolean
  id: string
  on: Mock<(event: string, handler: Handler) => FakeSocket>
  off: Mock<(event: string, handler?: Handler) => FakeSocket>
  emit: Mock<(event: string, ...args: any[]) => FakeSocket>
  removeAllListeners: Mock<(event?: string) => FakeSocket>
  disconnect: Mock<() => FakeSocket>

  /** Everything the code under test has emitted, in order. */
  emitted: Array<{ event: string, args: any[] }>

  /**
   * Deliver a server event to the handlers the code under test registered.
   * @param event - the event name
   * @param args - the payload
   */
  fire: (event: string, ...args: any[]) => void

  /**
   * The handlers currently registered for an event. Useful for proving a
   * component detached its listener on teardown.
   * @param event - the event name
   */
  handlers: (event: string) => Handler[]

  /**
   * The payloads emitted for one event.
   * @param event - the event name
   */
  payloadsFor: (event: string) => any[]

  /**
   * Answer the acknowledgement callback for an emitted event. Responses are
   * delivered synchronously, so an `io.request(...)` observable emits as soon
   * as it is subscribed. Answer with `{ error: ... }` to make the request fail
   * the way the server does.
   * @param event - the event name
   * @param response - the acknowledgement value, or a function returning it
   */
  respondTo: (event: string, response: AckResponder | any) => FakeSocket
}

export interface FakeIoNamespace extends IoNamespace {
  socket: FakeSocket & Socket
  connected: ReplaySubject<void>
  end: Mock<() => void>

  /** The resource and payload of every `request()` call, in order. */
  requests: Array<{ resource: string, payload: any }>

  /** Mark the socket connected, firing `connect` handlers and `connected`. */
  markConnected: () => void
}

export interface FakeNamespaceOptions {
  /**
   * Whether the namespace starts connected. Defaults to true, which is the
   * cache-hit case widgets actually meet: the status page opened the socket
   * before the widget was created, so `connected` already holds its value.
   * Pass false to drive the connect sequence yourself.
   */
  connected?: boolean
}

export function fakeSocket(connected = true): FakeSocket {
  const handlers = new Map<string, Handler[]>()
  const responders = new Map<string, AckResponder>()
  const emitted: Array<{ event: string, args: any[] }> = []

  const socket = {
    connected,
    id: 'fake-socket',
    emitted,
    on: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler])
      return socket
    }),
    off: vi.fn((event: string, handler?: Handler) => {
      if (!handler) {
        handlers.delete(event)
      } else {
        handlers.set(event, (handlers.get(event) ?? []).filter(existing => existing !== handler))
      }
      return socket
    }),
    removeAllListeners: vi.fn((event?: string) => {
      if (event) {
        handlers.delete(event)
      } else {
        handlers.clear()
      }
      return socket
    }),
    disconnect: vi.fn(() => {
      socket.connected = false
      return socket
    }),
    emit: vi.fn((event: string, ...args: any[]) => {
      emitted.push({ event, args })
      const ack = args.at(-1)
      if (typeof ack === 'function') {
        const responder = responders.get(event)
        ack(responder ? responder(args[0]) : undefined)
      }
      return socket
    }),
  } as unknown as FakeSocket

  socket.fire = (event: string, ...args: any[]) => {
    // Snapshot: a handler is allowed to detach itself while being called
    for (const handler of (handlers.get(event) ?? [])) {
      handler(...args)
    }
  }
  socket.handlers = (event: string) => [...(handlers.get(event) ?? [])]
  socket.payloadsFor = (event: string) => emitted.filter(entry => entry.event === event).map(entry => entry.args[0])
  socket.respondTo = (event: string, response: AckResponder | any) => {
    responders.set(event, typeof response === 'function' ? response : () => response)
    return socket
  }

  return socket
}

/**
 * A stand-in for one namespace returned by `WsService.connectToNamespace`.
 *
 * `request` is the real implementation, not a spy returning a canned value, so
 * specs exercise the `{ error }` mapping and the null-acknowledgement guard
 * exactly as production does.
 * @param options - see FakeNamespaceOptions
 */
export function fakeIoNamespace(options: FakeNamespaceOptions = {}): FakeIoNamespace {
  const isConnected = options.connected ?? true
  const socket = fakeSocket(isConnected)
  const connected = new ReplaySubject<void>(1)
  const requests: Array<{ resource: string, payload: any }> = []

  const request = (resource: string, payload?: any) => new Observable<any>((observer) => {
    requests.push({ resource, payload })
    socket.emit(resource, payload, (resp: any) => {
      if (resp && typeof resp === 'object' && resp.error) {
        observer.error(resp)
      } else {
        observer.next(resp)
      }
      observer.complete()
    })
  })

  const io = {
    socket,
    connected,
    requests,
    request: vi.fn(request),
    end: vi.fn(),
  } as unknown as FakeIoNamespace

  io.markConnected = () => {
    socket.connected = true
    socket.fire('connect')
    connected.next()
  }

  if (isConnected) {
    connected.next()
  }

  return io
}

export interface FakeWs {
  connectToNamespace: Mock<(name: string) => FakeIoNamespace>
  getExistingNamespace: Mock<(name: string) => FakeIoNamespace | undefined>

  /** Every namespace created so far. */
  namespaces: Map<string, FakeIoNamespace>

  /**
   * Get or create a namespace up front, so a spec can arrange responses and
   * grab the socket before the code under test asks for it.
   * @param name - the namespace name, e.g. 'status'
   * @param options - see FakeNamespaceOptions, applied only on creation
   */
  namespace: (name: string, options?: FakeNamespaceOptions) => FakeIoNamespace
}

/**
 * A stand-in for WsService.
 *
 * Supports both entry points: `connectToNamespace` creates on first use and
 * returns the identical object afterwards (the caching rule from #2806), and
 * `getExistingNamespace` returns only what already exists - widgets use the
 * second and assume the status page opened the socket first, so arrange with
 * `ws.namespace('status')` before creating the component.
 */
export function fakeWs(): FakeWs {
  const namespaces = new Map<string, FakeIoNamespace>()

  const namespace = (name: string, options?: FakeNamespaceOptions) => {
    if (!namespaces.has(name)) {
      namespaces.set(name, fakeIoNamespace(options))
    }
    return namespaces.get(name)!
  }

  return {
    namespaces,
    namespace,
    connectToNamespace: vi.fn((name: string) => namespace(name)),
    getExistingNamespace: vi.fn((name: string) => namespaces.get(name)),
  }
}
