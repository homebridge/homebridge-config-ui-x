import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'

import type { CloudflaredResult } from '../../src/modules/direct-connection/direct-connection.service.js'

import { EventEmitter } from 'node:events'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import process from 'node:process'
import { PassThrough } from 'node:stream'

import { ValidationPipe } from '@nestjs/common'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { copy, outputFile, pathExists, readFile, readJson, remove, utimes, writeJson } from 'fs-extra'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthModule } from '../../src/core/auth/auth.module.js'
import { AuthService } from '../../src/core/auth/auth.service.js'
import { getClientAddress, isSecureRequest, TUNNEL_MARK_HEADER, tunnelMark } from '../../src/core/auth/tunnel-request.js'
import { ConfigService } from '../../src/core/config/config.service.js'
import { CLOUDFLARED_SHA256, cloudflaredAssetName } from '../../src/modules/direct-connection/cloudflared-binary.js'
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
    // cloudflared is pointed at the loopback gateway, never the UI itself
    const gatewayUrl = (service as any).gateway.url
    expect(gatewayUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    expect(gatewayUrl).not.toBe(`http://127.0.0.1:${configService.ui.port}`)
    expect(yaml).toContain(`service: "${gatewayUrl}"`)
    expect(yaml).not.toContain('noTLSVerify')
    expect(yaml).toContain('service: http_status:404')
    expect(await pathExists(resolve(baseDir, 'credentials', `${TUNNEL_ID}.json`))).toBe(true)

    // The account-wide certificate is gone once the tunnel exists
    expect(await pathExists(certPath)).toBe(false)
    expect(res.json()).toMatchObject({ loggedIn: false, provisioned: true })

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
      (service as any).gateway.url,
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

  it('works with Homebridge insecure mode (-I), which only enables accessory control', async () => {
    configService.homebridgeInsecureMode = true
    try {
      await saveSettings({ variant: 'quick' })

      expect((await getStatus()).blockedReason).toBeNull()

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
    expect(await readFile(resolve(baseDir, 'tunnel.yml'), 'utf8')).toContain(`service: "${(service as any).gateway.url}"`)
  })

  it('reconnects a provisioned named tunnel without signing in again', async () => {
    await outputFile(resolve(baseDir, 'credentials', `${TUNNEL_ID}.json`), JSON.stringify({ TunnelID: TUNNEL_ID }))
    await writeJson(resolve(baseDir, 'settings.json'), {
      enabled: false,
      variant: 'named',
      hostname: 'homebridge.example.com',
      tunnelId: TUNNEL_ID,
    })
    ;(service as any).settings = null

    const res = await post('connect')

    expect(res.statusCode).toBe(200)
    expect(commands).toHaveLength(0)
    expect(spawned).toHaveLength(1)
  })

  it('removes a leftover account certificate after it expires', async () => {
    await signIn()
    const old = new Date(Date.now() - 16 * 60_000)
    await utimes(certPath, old, old)

    expect(await getStatus()).toMatchObject({ loggedIn: false })
    expect(await pathExists(certPath)).toBe(false)
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

  describe('tunnel gateway', () => {
    let origin: ReturnType<typeof createServer>
    let seen: { headers: Record<string, unknown>, url: string }[]
    let originalPort: number
    let originalHost: string | undefined
    let upgraded: { destroy: () => void }[]

    beforeEach(async () => {
      seen = []
      upgraded = []
      origin = createServer((req, res) => {
        seen.push({ headers: req.headers as Record<string, unknown>, url: req.url })
        res.writeHead(200, { 'content-type': 'text/plain' })
        res.end('ui')
      })
      await new Promise<void>(done => origin.listen(0, '127.0.0.1', done))
      originalPort = configService.ui.port
      originalHost = configService.ui.host
      configService.ui.port = (origin.address() as any).port
      configService.ui.host = undefined
    })

    afterEach(async () => {
      configService.ui.port = originalPort
      configService.ui.host = originalHost
      // Upgraded sockets are no longer tracked by the server
      upgraded.forEach(socket => socket.destroy())
      origin.closeAllConnections()
      await new Promise(done => origin.close(done))
    })

    async function connectQuick() {
      await saveSettings({ variant: 'quick' })
      expect((await post('connect')).statusCode).toBe(200)
      return (service as any).gateway.url as string
    }

    it('forwards to the UI with a mark the UI trusts, dropping forged marks', async () => {
      const gateway = await connectQuick()

      const res = await fetch(`${gateway}/api/auth/settings`, {
        headers: {
          'cf-connecting-ip': '203.0.113.7',
          'x-forwarded-proto': 'https',
          [TUNNEL_MARK_HEADER]: 'forged',
          [`${TUNNEL_MARK_HEADER}-client`]: '198.51.100.1',
        },
      })

      expect(res.status).toBe(200)
      expect(await res.text()).toBe('ui')
      expect(seen[0].url).toBe('/api/auth/settings')
      expect(seen[0].headers[TUNNEL_MARK_HEADER]).toBe(tunnelMark())
      expect(seen[0].headers[`${TUNNEL_MARK_HEADER}-client`]).toBe('203.0.113.7')

      const req = { ip: '127.0.0.1', protocol: 'http', headers: seen[0].headers as any }
      expect(isSecureRequest(req)).toBe(true)
      expect(getClientAddress(req)).toBe('tunnel:203.0.113.7')
    })

    it('ignores marks on requests that did not come through the gateway', () => {
      const req = {
        ip: '127.0.0.1',
        protocol: 'http',
        headers: {
          [TUNNEL_MARK_HEADER]: 'a'.repeat(64),
        } as any,
      }
      expect(isSecureRequest(req)).toBe(false)
      expect(getClientAddress(req)).toBe('127.0.0.1')
    })

    it('stops the tunnel as soon as the UI login is turned off', async () => {
      const gateway = await connectQuick()

      configService.ui.auth = 'none'
      const res = await fetch(`${gateway}/`)

      expect(res.status).toBe(503)
      expect(seen).toHaveLength(0)
      await vi.waitFor(async () => expect(await getStatus()).toMatchObject({ enabled: false, state: 'error' }))
      expect(spawned[0].killed).toBe(true)
      expect((service as any).gateway.url).toBeNull()
      expect(await readJson(resolve(baseDir, 'settings.json'))).toMatchObject({ enabled: false })
    })

    it('stops the tunnel from the watcher even with no traffic', async () => {
      vi.useFakeTimers({
        toFake: ['setInterval', 'clearInterval'],
      })
      try {
        await connectQuick()
        configService.ui.auth = 'none'
        await vi.advanceTimersByTimeAsync(5_000)
        await vi.waitFor(async () => expect((await getStatus()).enabled).toBe(false))
        expect(spawned[0].killed).toBe(true)
      } finally {
        vi.useRealTimers()
      }
    })

    it('refuses WebSocket upgrades while the UI login is off', async () => {
      const gateway = await connectQuick()
      configService.ui.auth = 'none'

      const { request } = await import('node:http')
      const status = await new Promise<number>((done) => {
        const req = request(`${gateway}/socket.io/?EIO=4&transport=websocket`, {
          headers: {
            'connection': 'Upgrade',
            'upgrade': 'websocket',
            'sec-websocket-version': '13',
            'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
          },
        })
        req.on('response', res => done(res.statusCode))
        req.on('upgrade', res => done(res.statusCode))
        req.on('error', () => done(-1))
        req.end()
      })
      expect(status).toBe(503)
    })

    it('passes WebSocket upgrades through to the UI', async () => {
      origin.on('upgrade', (req, socket) => {
        upgraded.push(socket)
        seen.push({ headers: req.headers as Record<string, unknown>, url: req.url })
        socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n')
        socket.on('data', d => socket.write(`echo:${d}`))
      })
      const gateway = await connectQuick()

      const { request } = await import('node:http')
      const reply = await new Promise<string>((done, fail) => {
        const req = request(`${gateway}/socket.io/?EIO=4&transport=websocket`, {
          headers: { connection: 'Upgrade', upgrade: 'websocket' },
        })
        req.on('upgrade', (res, socket) => {
          expect(res.statusCode).toBe(101)
          socket.once('data', (d) => {
            done(d.toString())
            socket.destroy()
          })
          socket.write('ping')
        })
        req.on('error', fail)
        req.end()
      })

      expect(reply).toBe('echo:ping')
      expect(seen[0].headers[TUNNEL_MARK_HEADER]).toBe(tunnelMark())
    })

    it('enforces Cloudflare Access when it is configured', async () => {
      const res = await saveSettings({
        variant: 'quick',
        accessTeamDomain: 'myteam',
        accessAudience: 'a'.repeat(64),
      })
      expect(res.json()).toMatchObject({ protection: 'cloudflare-access', accessTeamDomain: 'myteam.cloudflareaccess.com' })
      await post('connect')
      const gateway = (service as any).gateway.url

      expect((await fetch(`${gateway}/`)).status).toBe(403)
      expect((await fetch(`${gateway}/`, {
        headers: { 'cf-access-jwt-assertion': 'not.a.jwt' },
      })).status).toBe(403)
      expect(seen).toHaveLength(0)
    })

    it('requires both Cloudflare Access fields together, on a Cloudflare team domain', async () => {
      expect((await saveSettings({ variant: 'quick', accessTeamDomain: 'myteam' })).statusCode).toBe(400)
      expect((await saveSettings({
        variant: 'quick',
        accessTeamDomain: 'evil.example.com',
        accessAudience: 'a'.repeat(64),
      })).statusCode).toBe(400)
    })
  })

  it('reports password-only protection until every admin has two-factor', async () => {
    expect((await getStatus()).protection).toBe('password-only')
  })

  it('POST /auth/noauth refuses tunneled requests even with auth turned off', async () => {
    configService.ui.auth = 'none'
    const tunneled = await app.inject({
      method: 'POST',
      path: '/auth/noauth',
      headers: {
        [TUNNEL_MARK_HEADER]: tunnelMark(),
      },
    })
    expect(tunneled.statusCode).toBe(403)

    const local = await app.inject({ method: 'POST', path: '/auth/noauth' })
    expect(local.statusCode).toBe(201)
  })

  it('marks session cookies Secure for tunneled logins', async () => {
    const res = await app.inject({
      method: 'POST',
      path: '/auth/login',
      headers: {
        [TUNNEL_MARK_HEADER]: tunnelMark(),
        'x-uix-direct-connection-client': '203.0.113.9',
      },
      payload: { username: 'admin', password: 'admin' },
    })
    expect(String(res.headers['set-cookie'])).toContain('; Secure')

    const local = await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: { username: 'admin', password: 'admin' },
    })
    expect(String(local.headers['set-cookie'])).not.toContain('; Secure')
  })

  it('has a pinned checksum for every cloudflared asset it downloads', () => {
    for (const [platform, arch] of [
      ['linux', 'x64'],
      ['linux', 'arm64'],
      ['linux', 'arm'],
      ['linux', 'ia32'],
      ['darwin', 'x64'],
      ['darwin', 'arm64'],
      ['win32', 'x64'],
      ['win32', 'arm64'],
      ['win32', 'ia32'],
    ]) {
      expect(CLOUDFLARED_SHA256[cloudflaredAssetName(platform, arch)]).toMatch(/^[0-9a-f]{64}$/)
    }
  })
})
