import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'

import { EventEmitter } from 'node:events'
import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

import { ValidationPipe } from '@nestjs/common'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { copy, remove } from 'fs-extra'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthModule } from '../../src/core/auth/auth.module.js'
import { ConfigService } from '../../src/core/config/config.service.js'
import { AccessoriesModule } from '../../src/modules/accessories/accessories.module.js'
import { AccessoriesService } from '../../src/modules/accessories/accessories.service.js'
import { KioskGateway } from '../../src/modules/kiosk/kiosk.gateway.js'
import { KioskModule } from '../../src/modules/kiosk/kiosk.module.js'
import { KioskService } from '../../src/modules/kiosk/kiosk.service.js'
import { UsersModule } from '../../src/modules/users/users.module.js'

describe('Kiosk (e2e)', () => {
  let app: NestFastifyApplication
  let configService: ConfigService
  let accessoriesService: AccessoriesService
  let kioskService: KioskService
  let gateway: KioskGateway

  let storagePath: string
  let kioskFile: string
  let authFilePath: string
  let admin: string
  let guest: string

  const body = {
    name: 'Hall tablet',
    viewId: 'view-1',
    viewName: 'Hall',
    allowSensitive: false,
    allowedUniqueIds: ['a', 'lock', 'b'],
  }

  const login = async (username: string, password: string) => `Bearer ${(await app.inject({
    method: 'POST',
    path: '/auth/login',
    payload: { username, password },
  })).json().access_token}`

  const createDevice = async (overrides: Record<string, unknown> = {}) => (await app.inject({
    method: 'POST',
    path: '/kiosk/devices',
    headers: { authorization: admin },
    payload: {
      ...body,
      ...overrides,
    },
  })).json()

  const pairDevice = async (id: string, ip = '10.0.0.1') => {
    const code = (await app.inject({
      method: 'POST',
      path: `/kiosk/devices/${id}/pairing-code`,
      headers: { authorization: admin },
    })).json().code
    const res = await app.inject({
      method: 'POST',
      path: '/kiosk/pair',
      payload: { code },
      remoteAddress: ip,
    })
    return { code, res, token: res.json().token as string }
  }

  const fakeSocket = (kioskToken?: string) => {
    const socket = new EventEmitter() as any
    socket.handshake = {
      auth: { kioskToken },
      address: '10.0.0.9',
    }
    socket.data = {}
    socket.disconnect = vi.fn()
    const emitted = vi.fn()
    socket.emit = emitted
    return socket
  }

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = resolve(__dirname, '../../')
    process.env.UIX_STORAGE_PATH = resolve(__dirname, '../', '.homebridge')
    process.env.UIX_CONFIG_PATH = resolve(process.env.UIX_STORAGE_PATH, 'config.json')
    storagePath = process.env.UIX_STORAGE_PATH
    kioskFile = resolve(storagePath, 'kiosk-devices.json')
    authFilePath = resolve(storagePath, 'auth.json')

    await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH)
    await copy(resolve(__dirname, '../mocks', 'auth.json'), authFilePath)
    await copy(resolve(__dirname, '../mocks', '.uix-secrets'), resolve(storagePath, '.uix-secrets'))
    await remove(kioskFile)

    configService = new ConfigService()
    configService.homebridgeInsecureMode = true

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        KioskModule,
        AccessoriesModule,
        AuthModule,
        UsersModule,
      ],
    }).overrideProvider(ConfigService).useValue(configService).compile()

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, skipMissingProperties: true }))
    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    accessoriesService = app.get(AccessoriesService)
    kioskService = app.get(KioskService)
    gateway = app.get(KioskGateway)

    admin = await login('admin', 'admin')
    await app.inject({
      method: 'POST',
      path: '/users',
      headers: { authorization: admin },
      payload: {
        username: 'guest',
        name: 'Guest',
        password: 'guestpass1',
        admin: false,
      },
    })
    guest = await login('guest', 'guestpass1')
  })

  beforeEach(async () => {
    await remove(kioskFile)
    // a fresh service per test would be heavy: clear its rate-limit memory instead
    ;(kioskService as any).pairAttempts.clear()
    ;(kioskService as any).lastSeenWrites.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  afterAll(async () => {
    await remove(kioskFile)
    await copy(resolve(__dirname, '../mocks', 'auth.json'), authFilePath)
    await app.close()
  })

  describe('admin routes', () => {
    it('create, list, patch, delete', async () => {
      const created = await createDevice()
      expect(created.id).toBeTruthy()
      expect(created.owner).toBe('admin')
      expect(created.tokenHash).toBeUndefined()

      let list = (await app.inject({
        method: 'GET',
        path: '/kiosk/devices',
        headers: { authorization: admin },
      })).json()
      expect(list).toHaveLength(1)
      expect(list[0]).toMatchObject({ name: 'Hall tablet', paired: false })
      expect(list[0].tokenHash).toBeUndefined()
      expect(list[0].pairing).toBeUndefined()

      const patched = await app.inject({
        method: 'PATCH',
        path: `/kiosk/devices/${created.id}`,
        headers: { authorization: admin },
        payload: {
          name: 'Kitchen',
          allowSensitive: true,
          allowedUniqueIds: ['a'],
        },
      })
      expect(patched.statusCode).toBe(200)
      expect(patched.json()).toMatchObject({
        name: 'Kitchen',
        allowSensitive: true,
        allowedUniqueIds: ['a'],
        viewId: 'view-1',
      })

      const del = await app.inject({
        method: 'DELETE',
        path: `/kiosk/devices/${created.id}`,
        headers: { authorization: admin },
      })
      expect(del.statusCode).toBe(200)
      list = (await app.inject({
        method: 'GET',
        path: '/kiosk/devices',
        headers: { authorization: admin },
      })).json()
      expect(list).toHaveLength(0)
      expect((await app.inject({
        method: 'DELETE',
        path: `/kiosk/devices/${created.id}`,
        headers: { authorization: admin },
      })).statusCode).toBe(404)
    })

    it('validates input', async () => {
      const bad = [
        {
          ...body,
          name: 'x'.repeat(101),
        },
        {
          ...body,
          allowedUniqueIds: [
            'x'.repeat(201),
          ],
        },
        {
          ...body,
          allowedUniqueIds: Array.from({ length: 2001 }, (_, i) => String(i)),
        },
        { ...body, allowedUniqueIds: 'nope' },
        { name: 'only a name' },
      ]
      for (const payload of bad) {
        const res = await app.inject({
          method: 'POST',
          path: '/kiosk/devices',
          headers: { authorization: admin },
          payload,
        })
        expect(res.statusCode).toBe(400)
      }
    })

    it('rejects a non-admin and an anonymous caller', async () => {
      const created = await createDevice()
      const calls = [
        { method: 'GET', path: '/kiosk/devices' },
        { method: 'POST', path: '/kiosk/devices', payload: body },
        {
          method: 'PATCH',
          path: `/kiosk/devices/${created.id}`,
          payload: { name: 'x' },
        },
        { method: 'DELETE', path: `/kiosk/devices/${created.id}` },
        { method: 'POST', path: `/kiosk/devices/${created.id}/pairing-code` },
      ] as const
      for (const call of calls) {
        const asGuest = await app.inject({
          ...call,
          headers: { authorization: guest },
        } as any)
        expect(asGuest.statusCode).toBe(403)
        const anon = await app.inject(call as any)
        expect(anon.statusCode).toBe(401)
      }
    })

    it('writes the file with mode 0600 and no secrets in the listing', async () => {
      const created = await createDevice()
      const { token } = await pairDevice(created.id)
      const mode = (await stat(kioskFile)).mode & 0o777
      expect(process.platform === 'win32'
        ? 0o600
        : mode).toBe(0o600)
      const { readFile } = await import('node:fs/promises')
      expect(await readFile(kioskFile, 'utf8')).not.toContain(token)
    })
  })

  describe('pairing', () => {
    it('issues an 8 character code from the unambiguous alphabet', async () => {
      const created = await createDevice()
      const res = await app.inject({
        method: 'POST',
        path: `/kiosk/devices/${created.id}/pairing-code`,
        headers: { authorization: admin },
      })
      expect(res.json().code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/)
      expect(res.json().expiresAt).toBeGreaterThan(Date.now() + 9 * 60 * 1000)
    })

    it('pairs once, and the code is single use', async () => {
      const created = await createDevice()
      const { code, res, token } = await pairDevice(created.id)
      expect(res.statusCode).toBe(200)
      expect(token).toMatch(/^[\w-]{43}$/)
      expect(res.json().device).toEqual({ id: created.id, name: 'Hall tablet', viewName: 'Hall' })

      const again = await app.inject({
        method: 'POST',
        path: '/kiosk/pair',
        payload: { code },
        remoteAddress: '10.0.0.1',
      })
      expect(again.statusCode).toBe(401)

      const list = (await app.inject({
        method: 'GET',
        path: '/kiosk/devices',
        headers: { authorization: admin },
      })).json()
      expect(list[0].paired).toBe(true)
    })

    it('a new code invalidates the previous one', async () => {
      const created = await createDevice()
      const first = (await app.inject({
        method: 'POST',
        path: `/kiosk/devices/${created.id}/pairing-code`,
        headers: { authorization: admin },
      })).json().code
      await app.inject({
        method: 'POST',
        path: `/kiosk/devices/${created.id}/pairing-code`,
        headers: { authorization: admin },
      })
      expect((await app.inject({
        method: 'POST',
        path: '/kiosk/pair',
        payload: { code: first },
      })).statusCode).toBe(401)
    })

    it('rejects a wrong code and an expired code', async () => {
      const created = await createDevice()
      expect((await app.inject({
        method: 'POST',
        path: '/kiosk/pair',
        payload: { code: 'AAAAAAAA' },
      })).statusCode).toBe(401)

      vi.useFakeTimers({
        toFake: ['Date'],
      })
      const code = (await app.inject({
        method: 'POST',
        path: `/kiosk/devices/${created.id}/pairing-code`,
        headers: { authorization: admin },
      })).json().code
      vi.setSystemTime(Date.now() + 10 * 60 * 1000 + 1000)
      const res = await app.inject({
        method: 'POST',
        path: '/kiosk/pair',
        payload: { code },
      })
      expect(res.statusCode).toBe(401)
      expect(res.json().message).toBe('Invalid or expired pairing code')
    })

    it('rate limits attempts per IP', async () => {
      for (let i = 0; i < 10; i++) {
        const res = await app.inject({
          method: 'POST',
          path: '/kiosk/pair',
          payload: { code: 'AAAAAAAA' },
          remoteAddress: '10.0.0.5',
        })
        expect(res.statusCode).toBe(401)
      }
      const blocked = await app.inject({
        method: 'POST',
        path: '/kiosk/pair',
        payload: { code: 'AAAAAAAA' },
        remoteAddress: '10.0.0.5',
      })
      expect(blocked.statusCode).toBe(429)
      const other = await app.inject({
        method: 'POST',
        path: '/kiosk/pair',
        payload: { code: 'AAAAAAAA' },
        remoteAddress: '10.0.0.6',
      })
      expect(other.statusCode).toBe(401)
    })
  })

  describe('device token', () => {
    it('serves the session filtered to the allowed accessories, in layout order', async () => {
      vi.spyOn(accessoriesService, 'getAccessoryLayout').mockResolvedValue([
        {
          name: 'Empty',
          services: [
            { uniqueId: 'zzz' },
          ],
        },
        {
          name: 'Living',
          services: [
            { uniqueId: 'b', customName: 'Lamp' },
            { uniqueId: 'x' },
            { uniqueId: 'a', extra: 1 },
          ],
        },
        {
          name: 'Hall',
          services: [
            { uniqueId: 'lock' },
          ],
        },
      ])
      const created = await createDevice()
      const { token } = await pairDevice(created.id)
      const res = await app.inject({
        method: 'GET',
        path: '/kiosk/session',
        headers: { authorization: `Kiosk ${token}` },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({
        device: {
          id: created.id,
          name: 'Hall tablet',
          viewName: 'Hall',
          allowSensitive: false,
        },
        rooms: [
          {
            name: 'Living',
            services: [
              { uniqueId: 'b', customName: 'Lamp' },
              { uniqueId: 'a' },
            ],
          },
          {
            name: 'Hall',
            services: [
              { uniqueId: 'lock' },
            ],
          },
        ],
      })
      expect(accessoriesService.getAccessoryLayout).toHaveBeenCalledWith('admin')
    })

    it('is rejected on every other route', async () => {
      const created = await createDevice()
      const { token } = await pairDevice(created.id)
      for (const path of [
        '/accessories/layout',
        '/accessories',
        '/kiosk/devices',
        '/users',
      ]) {
        const res = await app.inject({
          method: 'GET',
          path,
          headers: { authorization: `Kiosk ${token}` },
        })
        expect(res.statusCode).toBe(401)
        const asBearer = await app.inject({
          method: 'GET',
          path,
          headers: { authorization: `Bearer ${token}` },
        })
        expect(asBearer.statusCode).toBe(401)
      }
    })

    it('does not accept a JWT, or garbage, on the session route', async () => {
      const jwt = await app.inject({
        method: 'GET',
        path: '/kiosk/session',
        headers: { authorization: admin },
      })
      expect(jwt.statusCode).toBe(401)
      const bearerJwt = await app.inject({
        method: 'GET',
        path: '/kiosk/session',
        headers: { authorization: `Kiosk ${admin.slice(7)}` },
      })
      expect(bearerJwt.statusCode).toBe(401)
      expect((await app.inject({ method: 'GET', path: '/kiosk/session' })).statusCode).toBe(401)
      expect((await app.inject({
        method: 'GET',
        path: '/kiosk/session',
        headers: { authorization: 'Kiosk nope' },
      })).statusCode).toBe(401)
    })

    it('stops working at once when the device is deleted', async () => {
      const created = await createDevice()
      const { token } = await pairDevice(created.id)
      const socket = fakeSocket(token)
      await gateway.handleConnection(socket)
      expect(socket.disconnect).not.toHaveBeenCalled()

      await app.inject({
        method: 'DELETE',
        path: `/kiosk/devices/${created.id}`,
        headers: { authorization: admin },
      })
      expect(socket.disconnect).toHaveBeenCalled()
      expect((await app.inject({
        method: 'GET',
        path: '/kiosk/session',
        headers: { authorization: `Kiosk ${token}` },
      })).statusCode).toBe(401)
    })

    it('stops working at once when the device is paired again', async () => {
      const created = await createDevice()
      const { token } = await pairDevice(created.id)
      const socket = fakeSocket(token)
      await gateway.handleConnection(socket)

      const second = await pairDevice(created.id)
      expect(second.token).not.toBe(token)
      expect(socket.disconnect).toHaveBeenCalled()
      expect((await app.inject({
        method: 'GET',
        path: '/kiosk/session',
        headers: { authorization: `Kiosk ${token}` },
      })).statusCode).toBe(401)
      expect((await app.inject({
        method: 'GET',
        path: '/kiosk/session',
        headers: { authorization: `Kiosk ${second.token}` },
      })).statusCode).toBe(200)
    })

    it('records last seen at most once a minute', async () => {
      const created = await createDevice()
      const { token } = await pairDevice(created.id)
      const get = () => app.inject({
        method: 'GET',
        path: '/kiosk/session',
        headers: { authorization: `Kiosk ${token}` },
        remoteAddress: '10.0.0.7',
      })
      await get()
      await new Promise(r => setTimeout(r, 50))
      const first = (await kioskService.getDevice(created.id)).lastSeenAt
      expect(first).toBeTruthy()
      expect((await kioskService.getDevice(created.id)).lastSeenIp).toBe('10.0.0.7')
      await get()
      await new Promise(r => setTimeout(r, 50))
      expect((await kioskService.getDevice(created.id)).lastSeenAt).toBe(first)
    })
  })

  describe('websocket', () => {
    const services = [
      { uniqueId: 'a', type: 'Lightbulb' },
      { uniqueId: 'lock', type: 'LockMechanism' },
      { uniqueId: 'other', type: 'Lightbulb' },
    ]
    let control: ReturnType<typeof vi.fn>

    const connectDevice = async (overrides: Record<string, unknown> = {}) => {
      const created = await createDevice(overrides)
      const { token } = await pairDevice(created.id)
      const socket = fakeSocket(token)
      await gateway.handleConnection(socket)
      control = vi.fn()
      vi.spyOn(accessoriesService, 'connect').mockImplementation(async (facade: any) => {
        facade.on('accessory-control', control)
        facade.emit('accessories-data', services)
        facade.emit('some-other-event', 1)
      })
      await gateway.connect(socket)
      await new Promise(r => setTimeout(r, 10))
      return { created, socket }
    }

    it('disconnects a socket without a valid token', async () => {
      for (const token of [
        undefined,
        'nope',
        admin.slice(7),
      ]) {
        const socket = fakeSocket(token)
        await gateway.handleConnection(socket)
        expect(socket.disconnect).toHaveBeenCalled()
      }
    })

    it('sends only the allowed accessories', async () => {
      const { socket } = await connectDevice()
      const sent = socket.emit.mock.calls.filter((c: any[]) => c[0] === 'accessories-data')
      expect(sent).toHaveLength(1)
      expect(sent[0][1].map((s: any) => s.uniqueId)).toEqual(['a', 'lock'])
      expect(socket.emit.mock.calls.some((c: any[]) => c[0] === 'some-other-event')).toBe(false)
    })

    it('refuses control of an accessory that is not allowed', async () => {
      const { socket } = await connectDevice({ allowSensitive: true })
      await gateway.control(socket, {
        set: { uniqueId: 'other', iid: 1, value: 1 },
      })
      expect(control).not.toHaveBeenCalled()
      expect(socket.emit).toHaveBeenCalledWith('accessory-control-failure', expect.any(String))
    })

    it('refuses a sensitive service unless the device allows it', async () => {
      const { socket } = await connectDevice({ allowSensitive: false })
      await gateway.control(socket, {
        set: { uniqueId: 'lock', iid: 1, value: 1 },
      })
      expect(control).not.toHaveBeenCalled()
      expect(socket.emit).toHaveBeenCalledWith('accessory-control-failure', expect.any(String))

      await gateway.control(socket, {
        set: { uniqueId: 'a', iid: 1, value: 1 },
      })
      expect(control).toHaveBeenCalledTimes(1)
    })

    it('allows a sensitive service when allowSensitive is set', async () => {
      const { socket } = await connectDevice({ allowSensitive: true })
      await gateway.control(socket, {
        set: { uniqueId: 'lock', iid: 1, value: 1 },
      })
      expect(control).toHaveBeenCalledTimes(1)
    })

    it('treats a Matter door lock as sensitive', async () => {
      const created = await createDevice({
        allowedUniqueIds: ['matter:1'],
      })
      const { token } = await pairDevice(created.id)
      const socket = fakeSocket(token)
      await gateway.handleConnection(socket)
      control = vi.fn()
      vi.spyOn(accessoriesService, 'connect').mockImplementation(async (facade: any) => {
        facade.on('accessory-control', control)
        facade.emit('accessories-data', [
          { uniqueId: 'matter:1', deviceType: 'DoorLock', protocol: 'matter' },
        ])
      })
      await gateway.connect(socket)
      await gateway.control(socket, {
        set: { uniqueId: 'matter:1', cluster: 'doorLock', attributes: {} },
      })
      expect(control).not.toHaveBeenCalled()
    })

    it('refuses control and disconnects once the device is revoked', async () => {
      const { created, socket } = await connectDevice({ allowSensitive: true })
      // revoke behind the socket's back, so only the per-call re-check can catch it
      await kioskService.deleteDevice(created.id)
      socket.disconnect.mockClear()
      await gateway.control(socket, {
        set: { uniqueId: 'a', iid: 1, value: 1 },
      })
      expect(control).not.toHaveBeenCalled()
      expect(socket.disconnect).toHaveBeenCalled()
    })
  })
})
