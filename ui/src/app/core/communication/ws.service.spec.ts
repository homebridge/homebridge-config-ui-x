import type { FakeSocket } from '@/testing'

import { TestBed } from '@angular/core/testing'
import { firstValueFrom } from 'rxjs'
import { io } from 'socket.io-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WsService } from '@/app/core/communication/ws.service'
import { environment } from '@/environments/environment'
import { fakeSocket, makeAuth } from '@/testing'
import { provideFakes } from '@/testing/providers'

vi.mock('socket.io-client', () => ({ io: vi.fn() }))

describe('WsService', () => {
  let service: WsService
  let auth: ReturnType<typeof makeAuth>
  let sockets: FakeSocket[]

  beforeEach(() => {
    sockets = []
    vi.mocked(io).mockReset()
    vi.mocked(io).mockImplementation(() => {
      const socket = fakeSocket(false)
      sockets.push(socket)
      return socket as any
    })

    auth = makeAuth()
    TestBed.configureTestingModule({
      providers: [provideFakes({ auth })],
    })
    service = TestBed.inject(WsService)
  })

  describe('connecting', () => {
    it('opens the namespace with the app reconnection settings', () => {
      service.connectToNamespace('status')

      expect(io).toHaveBeenCalledTimes(1)
      const [url, options] = vi.mocked(io).mock.calls[0]
      expect(url).toBe(`${environment.api.socket}/status`)
      expect(options).toMatchObject({ reconnectionAttempts: 10, reconnectionDelayMax: 30000 })
    })

    it('sends the token that is current at each handshake', () => {
      service.connectToNamespace('status')
      const { auth: authCallback } = vi.mocked(io).mock.calls[0][1] as any

      // socket.io calls this again on every reconnect. A plain object would
      // freeze whatever the token was when the socket was built - which during
      // bootstrap is null, and the server then rejects every retry
      const first = vi.fn()
      authCallback(first)
      expect(first).toHaveBeenCalledWith({ token: 'test-access-token' })

      auth.token = 'rotated-token'
      const second = vi.fn()
      authCallback(second)
      expect(second).toHaveBeenCalledWith({ token: 'rotated-token' })
    })
  })

  describe('caching a namespace', () => {
    it('returns the same namespace and does not open a second socket', () => {
      const first = service.connectToNamespace('status')
      const second = service.connectToNamespace('status')

      expect(second).toBe(first)
      expect(io).toHaveBeenCalledTimes(1)
    })

    it('registers the connect handler only once', () => {
      service.connectToNamespace('status')
      service.connectToNamespace('status')

      // Re-binding on a cache hit stacks a listener per call and eventually
      // trips MaxListenersExceededWarning, and doubles the emit on reconnect
      expect(sockets[0].handlers('connect')).toHaveLength(1)
    })

    it('opens a separate socket per namespace', () => {
      const status = service.connectToNamespace('status')
      const child = service.connectToNamespace('child-bridges')

      expect(child).not.toBe(status)
      expect(io).toHaveBeenCalledTimes(2)
    })

    it('replays the connection to a subscriber that arrives late', async () => {
      const namespace = service.connectToNamespace('status')

      sockets[0].fire('connect')

      // `connected` is a ReplaySubject(1) so a caller that subscribes after
      // the socket is already up still fires. This is what lets callers skip
      // an `if (socket.connected)` fallback, which would double-emit (#2806)
      await expect(firstValueFrom(namespace.connected!)).resolves.toBeUndefined()
    })
  })

  describe('getExistingNamespace', () => {
    it('returns nothing until the namespace has been opened', () => {
      expect(service.getExistingNamespace('status')).toBeUndefined()
    })

    it('returns the open namespace without opening another socket', () => {
      const opened = service.connectToNamespace('status')

      expect(service.getExistingNamespace('status')).toBe(opened)
      expect(io).toHaveBeenCalledTimes(1)
    })
  })

  describe('request', () => {
    it('emits the acknowledgement and completes', async () => {
      const namespace = service.connectToNamespace('status')
      sockets[0].respondTo('get-server-uptime-info', { time: { uptime: 42 } })

      await expect(firstValueFrom(namespace.request('get-server-uptime-info'))).resolves.toEqual({ time: { uptime: 42 } })
      expect(sockets[0].payloadsFor('get-server-uptime-info')).toEqual([undefined])
    })

    it('sends the payload with the request', async () => {
      const namespace = service.connectToNamespace('status')
      sockets[0].respondTo('get-server-network-info', {})

      await firstValueFrom(namespace.request('get-server-network-info', { netInterfaces: ['eth0'] }))

      expect(sockets[0].payloadsFor('get-server-network-info')).toEqual([{ netInterfaces: ['eth0'] }])
    })

    it('fails when the server acknowledges with an error', async () => {
      const namespace = service.connectToNamespace('status')
      sockets[0].respondTo('restart-child-bridge', { error: 'Bridge not found' })

      await expect(firstValueFrom(namespace.request('restart-child-bridge', 'AA:BB'))).rejects.toEqual({ error: 'Bridge not found' })
    })

    it('treats a null acknowledgement as an empty result', async () => {
      const namespace = service.connectToNamespace('status')
      sockets[0].respondTo('get-dashboard-init', null)

      // typeof null is 'object', so without the null guard this throws inside
      // the acknowledgement callback rather than resolving
      await expect(firstValueFrom(namespace.request('get-dashboard-init'))).resolves.toBeNull()
    })
  })

  describe('end', () => {
    it('tells the server to end the session but leaves the listeners alone', () => {
      const namespace = service.connectToNamespace('status')

      namespace.end!()

      expect(sockets[0].emitted.at(-1)?.event).toBe('end')
      // The namespace is shared - status feeds the dashboard and every widget -
      // so wiping listeners when one consumer closes would silence the rest
      expect(sockets[0].removeAllListeners).not.toHaveBeenCalled()
    })
  })
})
