import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'

import type { CloudflaredResult } from '../../src/modules/direct-connection/direct-connection.service.js'

import { EventEmitter } from 'node:events'
import { resolve } from 'node:path'
import process from 'node:process'
import { PassThrough } from 'node:stream'

import { ValidationPipe } from '@nestjs/common'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { copy, outputFile, pathExists, readFile, readJson, remove, writeJson } from 'fs-extra'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthModule } from '../../src/core/auth/auth.module.js'
import { AuthService } from '../../src/core/auth/auth.service.js'
import { ConfigService } from '../../src/core/config/config.service.js'
import { cloudflaredAssetName } from '../../src/modules/direct-connection/cloudflared-binary.js'
import { DirectConnectionModule } from '../../src/modules/direct-connection/direct-connection.module.js'
import { DirectConnectionService } from '../../src/modules/direct-connection/direct-connection.service.js'

import '../../src/global-defaults.js'

const TUNNEL_ID = '0f1e2d3c-4b5a-4968-8776-655443322110'

/**
 * Stands in for a cloudflared child process.
 */
class FakeProcess extends EventEmitter {
  stdout = new PassThrough()
  stderr = new PassThrough()
  exitCode: number | null = null
  signalCode: string | null = null
  killed = false

  constructor(public args: string[]) {
    super()
  }

  emitLine(line: string) {
    this.stderr.write(`${line}\n`)
  }

  kill(signal: string = 'SIGTERM') {
    if (this.exitCode === null && this.signalCode === null) {
      this.killed = true
      this.signalCode = signal
      setImmediate(() => this.emit('close', null, signal))
    }
    return true
  }

  crash(code: number) {
    this.exitCode = code
    this.emit('close', code, null)
  }
}

describe('DirectConnectionController (e2e)', () => {
  let app: NestFastifyApplication
  let service: DirectConnectionService
  let configService: ConfigService
  let authService: AuthService

  let authorization: string
  let baseDir: string
  let certPath: string

  let commands: string[][]
  let commandResponder: (args: string[]) => Promise<CloudflaredResult> | CloudflaredResult
  let spawned: FakeProcess[]

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = resolve(__dirname, '../../')
    process.env.UIX_STORAGE_PATH = resolve(__dirname, '../', '.homebridge')
    process.env.UIX_CONFIG_PATH = resolve(process.env.UIX_STORAGE_PATH, 'config.json')

    await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH)
    await copy(resolve(__dirname, '../mocks', 'auth.json'), resolve(process.env.UIX_STORAGE_PATH, 'auth.json'))
    await copy(resolve(__dirname, '../mocks', '.uix-secrets'), resolve(process.env.UIX_STORAGE_PATH, '.uix-secrets'))

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [DirectConnectionModule, AuthModule],
    }).compile()

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      skipMissingProperties: true,
    }))

    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    service = app.get(DirectConnectionService)
    configService = app.get(ConfigService)
    authService = app.get(AuthService)

    baseDir = service.baseDir
    certPath = resolve(baseDir, '.cloudflared', 'cert.pem')
  })

  beforeEach(async () => {
    authorization = `bearer ${(await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: { username: 'admin', password: 'admin' },
    })).json().access_token}`

    await remove(baseDir)
    ;(service as any).settings = null

    commands = []
    spawned = []
    commandResponder = () => ({ code: 0, stdout: '', stderr: '' })

    vi.spyOn(service as any, 'getBinary').mockResolvedValue('/fake/cloudflared')
    vi.spyOn(service as any, 'runCloudflared').mockImplementation(async (_bin: string, args: string[]) => {
      commands.push(args)
      return commandResponder(args)
    })
    vi.spyOn(service as any, 'spawnCloudflared').mockImplementation((_bin: string, args: string[]) => {
      const proc = new FakeProcess(args)
      spawned.push(proc)
      return proc
    })
  })

  afterEach(async () => {
    await service.disconnect()
    configService.ui.auth = 'form'
    vi.restoreAllMocks()
  })

  afterAll(async () => {
    await remove(baseDir)
    await app.close()
  })

  /**
   * Answers cloudflared management commands like a fresh Cloudflare account.
   */
  function freshAccount(routedHostname = 'homebridge.example.com') {
    commandResponder = async (args) => {
      if (args[1] === 'list') {
        return { code: 0, stdout: '[]', stderr: '' }
      }
      if (args[1] === 'create') {
        await writeJson(args[args.indexOf('--cred-file') + 1], { TunnelID: TUNNEL_ID })
        return {
          code: 0,
          stdout: JSON.stringify({
            id: TUNNEL_ID,
            name: args.at(-1),
          }),
          stderr: '',
        }
      }
      if (args[1] === 'route') {
        return { code: 0, stdout: '', stderr: `2026-10-31T12:00:00Z INF Added CNAME ${routedHostname} which will route to this tunnel tunnelID=${TUNNEL_ID}\n` }
      }
      return { code: 0, stdout: '', stderr: '' }
    }
  }

  async function signIn() {
    await outputFile(certPath, 'fake cert')
  }

  async function saveSettings(payload: Record<string, unknown>) {
    return app.inject({
      method: 'PUT',
      path: '/settings/direct-connection',
      headers: { authorization },
      payload,
    })
  }

  async function post(action: string) {
    return app.inject({
      method: 'POST',
      path: `/settings/direct-connection/${action}`,
      headers: { authorization },
    })
  }

  async function getStatus() {
    return (await app.inject({
      method: 'GET',
      path: '/settings/direct-connection',
      headers: { authorization },
    })).json()
  }

  it('maps platforms to cloudflared release assets', () => {
    expect(cloudflaredAssetName('linux', 'arm64')).toBe('cloudflared-linux-arm64')
    expect(cloudflaredAssetName('darwin', 'arm64')).toBe('cloudflared-darwin-arm64.tgz')
    expect(cloudflaredAssetName('win32', 'x64')).toBe('cloudflared-windows-amd64.exe')
    expect(cloudflaredAssetName('freebsd', 'x64')).toBeNull()
  })

  it('GET /settings/direct-connection returns the defaults', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/settings/direct-connection',
      headers: { authorization },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      blockedReason: null,
      enabled: false,
      variant: 'named',
      hostname: '',
      tunnelId: null,
      loggedIn: false,
      loginInProgress: false,
      state: 'stopped',
      publicUrl: null,
      lastError: null,
    })
  })

  it('rejects requests without a token', async () => {
    const res = await app.inject({ method: 'GET', path: '/settings/direct-connection' })
    expect(res.statusCode).toBe(401)
  })

  it('rejects non-admin users', async () => {
    await authService.addUser({
      name: 'Viewer',
      username: 'viewer',
      password: 'viewer',
      admin: false,
    } as any)
    const token = (await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: { username: 'viewer', password: 'viewer' },
    })).json().access_token

    for (const [method, path] of [
      ['GET', ''],
      ['PUT', ''],
      ['POST', '/connect'],
      ['POST', '/login'],
      ['POST', '/logout'],
    ] as const) {
      const res = await app.inject({
        method,
        path: `/settings/direct-connection${path}`,
        headers: { authorization: `bearer ${token}` },
        payload: {},
      })
      expect({ method, path, status: res.statusCode }).toEqual({ method, path, status: 403 })
    }

    await copy(resolve(__dirname, '../mocks', 'auth.json'), resolve(process.env.UIX_STORAGE_PATH, 'auth.json'))
  })

  it('PUT /settings/direct-connection validates the hostname', async () => {
    for (const hostname of [
      'not a host',
      'localhost',
      'https://homebridge.example.com',
      'home\nbridge.example.com',
      '*.example.com',
    ]) {
      const res = await saveSettings({ variant: 'named', hostname })
      expect({ hostname, status: res.statusCode }).toEqual({ hostname, status: 400 })
    }

    expect((await saveSettings({ variant: 'other' })).statusCode).toBe(400)
  })

  it('PUT /settings/direct-connection saves the settings', async () => {
    const res = await saveSettings({ variant: 'named', hostname: 'HomeBridge.Example.com' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ variant: 'named', hostname: 'homebridge.example.com' })
    expect(await readJson(resolve(baseDir, 'settings.json'))).toMatchObject({ enabled: false, hostname: 'homebridge.example.com' })
  })

  it('POST /settings/direct-connection/connect requires a Cloudflare sign-in for named tunnels', async () => {
    await saveSettings({ variant: 'named', hostname: 'homebridge.example.com' })

    const res = await post('connect')

    expect(res.statusCode).toBe(400)
    expect(res.json().message).toContain('Sign in with Cloudflare')
    expect(spawned).toHaveLength(0)
  })

  it('POST /settings/direct-connection/connect creates, routes and runs a named tunnel', async () => {
    await signIn()
    freshAccount()
    await saveSettings({ variant: 'named', hostname: 'homebridge.example.com' })

    const res = await post('connect')

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      enabled: true,
      tunnelId: TUNNEL_ID,
      state: 'starting',
      publicUrl: 'https://homebridge.example.com',
    })

    // Never overwrites an existing DNS record
    const route = commands.find(c => c[1] === 'route')
    expect(route).toEqual([
      'tunnel',
      'route',
      'dns',
      TUNNEL_ID,
      'homebridge.example.com',
    ])

    // Ingress points at the local UI and nothing else
    const yaml = await readFile(resolve(baseDir, 'tunnel.yml'), 'utf8')
    expect(yaml).toContain(`tunnel: "${TUNNEL_ID}"`)
    expect(yaml).toContain('hostname: "homebridge.example.com"')
    expect(yaml).toContain(`service: "http://127.0.0.1:${configService.ui.port}"`)
    expect(yaml).toContain('service: http_status:404')
    expect(await pathExists(resolve(baseDir, 'credentials', `${TUNNEL_ID}.json`))).toBe(true)

    expect(spawned).toHaveLength(1)
    expect(spawned[0].args).toEqual([
      'tunnel',
      '--no-autoupdate',
      '--config',
      resolve(baseDir, 'tunnel.yml'),
      'run',
    ])

    spawned[0].emitLine('2026-10-31T12:00:00Z INF Registered tunnel connection connIndex=0 connection=abc event=0 ip=198.41.200.13 location=ord protocol=quic')
    await new Promise(setImmediate)

    expect(await getStatus()).toMatchObject({ state: 'connected', publicUrl: 'https://homebridge.example.com' })
    expect(await readJson(resolve(baseDir, 'settings.json'))).toMatchObject({ enabled: true, tunnelId: TUNNEL_ID })
  })

  it('POST /settings/direct-connection/connect fetches credentials for an existing tunnel', async () => {
    await signIn()
    commandResponder = async (args) => {
      if (args[1] === 'list') {
        return {
          code: 0,
          stdout: JSON.stringify([
            { id: TUNNEL_ID, name: 'homebridge-homebridge-example-com' },
          ]),
          stderr: '',
        }
      }
      if (args[1] === 'route') {
        return { code: 0, stdout: '', stderr: 'INF homebridge.example.com is already configured to route to your tunnel tunnelID=x\n' }
      }
      return { code: 0, stdout: '', stderr: '' }
    }
    await saveSettings({ variant: 'named', hostname: 'homebridge.example.com' })

    const res = await post('connect')

    expect(res.statusCode).toBe(200)
    expect(commands.some(c => c[1] === 'create')).toBe(false)
    expect(commands.find(c => c[1] === 'token')).toEqual([
      'tunnel',
      'token',
      '--cred-file',
      resolve(baseDir, 'credentials', `${TUNNEL_ID}.json`),
      TUNNEL_ID,
    ])
  })

  it('POST /settings/direct-connection/connect refuses a hostname outside the signed-in zone', async () => {
    await signIn()
    freshAccount('homebridge.other.com.example.com')
    await saveSettings({ variant: 'named', hostname: 'homebridge.other.com' })

    const res = await post('connect')

    expect(res.statusCode).toBe(400)
    expect(res.json().message).toContain('is not in the Cloudflare zone')
    expect(spawned).toHaveLength(0)
    expect(await getStatus()).toMatchObject({ enabled: false, state: 'error' })
  })

  it('POST /settings/direct-connection/connect reports cloudflared errors', async () => {
    await signIn()
    freshAccount()
    const account = commandResponder
    commandResponder = (args) => {
      if (args[1] === 'route') {
        return { code: 1, stdout: '', stderr: '2026-10-31T12:00:00Z ERR Failed to add route: code: 1003, reason: Failed to create record homebridge.example.com with err An A, AAAA, or CNAME record with that host already exists. For more details, refer to <https://developers.cloudflare.com/dns/manage-dns-records/troubleshooting/records-with-same-name/>.\n' }
      }
      return account(args)
    }
    await saveSettings({ variant: 'named', hostname: 'homebridge.example.com' })

    const res = await post('connect')

    expect(res.statusCode).toBe(400)
    expect(res.json().message).toBe('A DNS record for homebridge.example.com already exists in Cloudflare. If it points to an old tunnel or a service you no longer use, delete it under DNS → Records in the Cloudflare dashboard and connect again. Otherwise, choose a different hostname.')
  })

  it('tidies other cloudflared errors', async () => {
    await signIn()
    commandResponder = () => ({ code: 1, stdout: '', stderr: '2026-10-31T12:00:00Z ERR Failed to list tunnels: code: 10000, reason: Authentication error. For more details, refer to <https://developers.cloudflare.com/x/>.\n' })
    await saveSettings({ variant: 'named', hostname: 'homebridge.example.com' })

    const res = await post('connect')

    expect(res.json().message).toBe('Could not list tunnels: Authentication error.')
  })

  it('POST /settings/direct-connection/connect runs a quick tunnel without an account', async () => {
    await saveSettings({ variant: 'quick' })

    const res = await post('connect')

    expect(res.statusCode).toBe(200)
    expect(commands).toHaveLength(0)
    expect(spawned[0].args).toEqual([
      'tunnel',
      '--no-autoupdate',
      '--config',
      resolve(baseDir, 'quick.yml'),
      '--url',
      `http://127.0.0.1:${configService.ui.port}`,
    ])

    spawned[0].emitLine('2026-10-31T12:00:00Z INF |  https://lucky-words-here.trycloudflare.com  |')
    spawned[0].emitLine('2026-10-31T12:00:01Z INF Registered tunnel connection connIndex=0 protocol=quic')
    await new Promise(setImmediate)

    expect(await getStatus()).toMatchObject({ state: 'connected', publicUrl: 'https://lucky-words-here.trycloudflare.com' })
  })

  it('refuses to publish the UI when authentication is disabled', async () => {
    configService.ui.auth = 'none'
    await saveSettings({ variant: 'quick' })

    expect((await getStatus()).blockedReason).toBe('auth-disabled')

    const connect = await post('connect')
    expect(connect.statusCode).toBe(400)
    expect(connect.json().message).toContain('login enabled')

    expect((await post('login')).statusCode).toBe(400)
    expect(spawned).toHaveLength(0)
  })

  it('allows insecure mode but reports it so the UI can warn', async () => {
    expect((await getStatus()).insecureMode).toBe(false)

    configService.homebridgeInsecureMode = true
    try {
      await saveSettings({ variant: 'quick' })

      expect(await getStatus()).toMatchObject({ blockedReason: null, insecureMode: true })

      const connect = await post('connect')
      expect(connect.statusCode).toBe(200)
      expect(spawned).toHaveLength(1)
    } finally {
      configService.homebridgeInsecureMode = false
    }
  })

  it('PUT /settings/direct-connection is refused while connected', async () => {
    await saveSettings({ variant: 'quick' })
    await post('connect')

    const res = await saveSettings({ variant: 'named', hostname: 'homebridge.example.com' })
    expect(res.statusCode).toBe(409)
  })

  it('restarts cloudflared after it exits unexpectedly', async () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout'],
    })
    try {
      await saveSettings({ variant: 'quick' })
      await post('connect')

      spawned[0].emitLine('2026-10-31T12:00:00Z ERR failed to reach the edge')
      await new Promise(setImmediate)
      spawned[0].crash(1)

      expect(await getStatus()).toMatchObject({ enabled: true, state: 'reconnecting', lastError: 'cloudflared stopped: failed to reach the edge' })

      await vi.advanceTimersByTimeAsync(5_000)
      expect(spawned).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('POST /settings/direct-connection/disconnect stops the tunnel and keeps it off', async () => {
    await saveSettings({ variant: 'quick' })
    await post('connect')

    const res = await post('disconnect')

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ enabled: false, state: 'stopped', publicUrl: null })
    expect(spawned[0].killed).toBe(true)
    expect(await readJson(resolve(baseDir, 'settings.json'))).toMatchObject({ enabled: false })
  })

  it('starts an enabled tunnel when the server starts', async () => {
    await saveSettings({ variant: 'quick' })
    await writeJson(resolve(baseDir, 'settings.json'), {
      enabled: true,
      variant: 'quick',
      hostname: '',
      tunnelId: null,
    })
    ;(service as any).settings = null

    await service.onApplicationBootstrap()
    await (service as any).queue

    expect(spawned).toHaveLength(1)
    expect((await getStatus()).state).toBe('starting')
  })

  it('resumes a provisioned named tunnel on start without calling the Cloudflare API', async () => {
    await signIn()
    await outputFile(resolve(baseDir, 'credentials', `${TUNNEL_ID}.json`), JSON.stringify({ TunnelID: TUNNEL_ID }))
    await writeJson(resolve(baseDir, 'settings.json'), {
      enabled: true,
      variant: 'named',
      hostname: 'homebridge.example.com',
      tunnelId: TUNNEL_ID,
    })
    ;(service as any).settings = null

    await service.onApplicationBootstrap()
    await (service as any).queue

    expect(commands).toHaveLength(0)
    expect(spawned).toHaveLength(1)
    expect(spawned[0].args.at(-1)).toBe('run')
    expect(await readFile(resolve(baseDir, 'tunnel.yml'), 'utf8')).toContain(`service: "http://127.0.0.1:${configService.ui.port}"`)
  })

  it('retries starting an enabled tunnel that fails on start', async () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout'],
    })
    try {
      await signIn()
      await writeJson(resolve(baseDir, 'settings.json'), {
        enabled: true,
        variant: 'named',
        hostname: 'homebridge.example.com',
        tunnelId: null,
      })
      ;(service as any).settings = null
      commandResponder = () => ({ code: 1, stdout: '', stderr: 'ERR failed to reach the Cloudflare API\n' })

      await service.onApplicationBootstrap()
      await (service as any).queue
      expect(spawned).toHaveLength(0)
      expect((await getStatus()).lastError).toContain('failed to reach the Cloudflare API')

      freshAccount()
      await vi.advanceTimersByTimeAsync(5_000)
      await (service as any).queue
      expect(spawned).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('POST /settings/direct-connection/login returns the Cloudflare sign-in link', async () => {
    const res = post('login')
    await vi.waitFor(() => expect(spawned).toHaveLength(1))
    expect(spawned[0].args).toEqual(['tunnel', 'login'])
    spawned[0].stdout.write('Please open the following URL and log in with your Cloudflare account:\n\nhttps://dash.cloudflare.com/argotunnel?aud=&callback=https%3A%2F%2Flogin.cloudflareaccess.org%2Fabc\n')

    const body = (await res).json()
    expect(body).toMatchObject({
      loggedIn: false,
      loginInProgress: true,
      loginUrl: 'https://dash.cloudflare.com/argotunnel?aud=&callback=https%3A%2F%2Flogin.cloudflareaccess.org%2Fabc',
    })

    // cloudflared writes the certificate once the user approves
    await signIn()
    spawned[0].crash(0)
    await new Promise(setImmediate)
    expect(await getStatus()).toMatchObject({ loggedIn: true, loginInProgress: false, loginUrl: null })
  })

  it('POST /settings/direct-connection/logout removes the Cloudflare credentials', async () => {
    await signIn()
    freshAccount()
    await saveSettings({ variant: 'named', hostname: 'homebridge.example.com' })
    await post('connect')

    const res = await post('logout')

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      enabled: false,
      loggedIn: false,
      tunnelId: null,
      hostname: 'homebridge.example.com',
    })
    expect(await pathExists(certPath)).toBe(false)
    expect(await pathExists(resolve(baseDir, 'credentials'))).toBe(false)
    expect(await pathExists(resolve(baseDir, 'tunnel.yml'))).toBe(false)
  })
})
