import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'

import { resolve } from 'node:path'
import process from 'node:process'

import { ValidationPipe } from '@nestjs/common'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { WsException } from '@nestjs/websockets'
import { copy, pathExists, remove } from 'fs-extra'
import { generate, generateSecret } from 'otplib'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthModule } from '../../src/core/auth/auth.module.js'
import { AuthService } from '../../src/core/auth/auth.service.js'
import { WsAdminGuard } from '../../src/core/auth/guards/ws-admin-guard.js'
import { WsGuard } from '../../src/core/auth/guards/ws.guard.js'
import { ConfigService } from '../../src/core/config/config.service.js'
import { PluginsService } from '../../src/modules/plugins/plugins.service.js'

import '../../src/global-defaults.js'

const RE_JWT = /^[\w-]+\.[\w-]+\.[\w-]+$/

describe('AuthController (e2e)', () => {
  let app: NestFastifyApplication

  let authService: AuthService
  let configService: ConfigService

  let authFilePath: string
  let secretsFilePath: string

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = resolve(__dirname, '../../')
    process.env.UIX_STORAGE_PATH = resolve(__dirname, '../', '.homebridge')
    process.env.UIX_CONFIG_PATH = resolve(process.env.UIX_STORAGE_PATH, 'config.json')

    authFilePath = resolve(process.env.UIX_STORAGE_PATH, 'auth.json')
    secretsFilePath = resolve(process.env.UIX_STORAGE_PATH, '.uix-secrets')

    // Setup test config
    await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH)

    // Remove any existing auth / secret files
    await remove(authFilePath)
    await remove(secretsFilePath)

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AuthModule],
    }).compile()

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter())

    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      skipMissingProperties: true,
    }))

    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    authService = app.get(AuthService)
    configService = app.get(ConfigService)
  })

  beforeEach(async () => {
    // Setup test auth file
    await copy(resolve(__dirname, '../mocks', 'auth.json'), authFilePath)
    configService.setupWizardComplete = true
  })

  afterEach(async () => {
    // Restore auth mode after each test
    const thisConfigService: ConfigService = app.get(ConfigService)
    thisConfigService.ui.auth = 'form'
  })

  it('should .uix-secrets on launch', async () => {
    expect(await pathExists(secretsFilePath)).toBe(true)
  })

  it('should flag first run setup wizard as not complete if authfile not created', async () => {
    // Remove test auth file
    await remove(authFilePath)
    await authService.checkAuthFile()
    expect(configService.setupWizardComplete).toBe(false)
  })

  it('should flag first run setup wizard as complete if authfile is created', async () => {
    // Test authfile created in beforeEach hook
    await authService.checkAuthFile()
    expect(configService.setupWizardComplete).toBe(true)
  })

  it('POST /auth/login (valid login)', async () => {
    const res = await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: {
        username: 'admin',
        password: 'admin',
      },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json()).toHaveProperty('access_token')
  })

  it('POST /auth/login (invalid login)', async () => {
    const res = await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: {
        username: 'admin',
        password: 'not-the-real-password',
      },
    })

    expect(res.statusCode).toBe(403)
    expect(res.json()).not.toHaveProperty('access_token')
  })

  it('POST /auth/login (missing password)', async () => {
    const res = await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: {
        username: 'admin',
      },
    })

    expect(res.statusCode).toBe(400)
    expect(res.body).toContain('password should not be null or undefined')
    expect(res.json()).not.toHaveProperty('access_token')
  })

  it('POST /auth/login (missing username)', async () => {
    const res = await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: {
        password: 'admin',
      },
    })

    expect(res.statusCode).toBe(400)
    expect(res.body).toContain('username should not be null or undefined')
    expect(res.json()).not.toHaveProperty('access_token')
  })

  it('POST /auth/noauth (auth enabled)', async () => {
    const res = await app.inject({
      method: 'POST',
      path: '/auth/noauth',
    })

    expect(res.statusCode).toBe(401)
    expect(res.json()).not.toHaveProperty('access_token')
  })

  it('POST /auth/noauth (auth disabled)', async () => {
    // Set auth mode to none
    const thisConfigService: ConfigService = app.get(ConfigService)
    thisConfigService.ui.auth = 'none'

    const res = await app.inject({
      method: 'POST',
      path: '/auth/noauth',
    })

    expect(res.statusCode).toBe(201)
    expect(res.json()).toHaveProperty('access_token')
  })

  it('GET /auth/check (valid token)', async () => {
    const accessToken = (await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: {
        username: 'admin',
        password: 'admin',
      },
    })).json().access_token

    const res = await app.inject({
      method: 'GET',
      path: '/auth/check',
      headers: {
        authorization: `bearer ${accessToken}`,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('OK')
  })

  it('GET /auth/check (invalid token)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/auth/check',
      headers: {
        authorization: 'bearer xxxxxxxx',
      },
    })

    expect(res.statusCode).toBe(401)
  })

  it('GET /auth/settings', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/auth/settings',
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().env.homebridgeInstanceName).toBe('Homebridge Test')
  })

  it('GET /auth/settings (authenticated - no passphrase leaked)', async () => {
    const accessToken = (await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: {
        username: 'admin',
        password: 'admin',
      },
    })).json().access_token

    const res = await app.inject({
      method: 'GET',
      path: '/auth/settings',
      headers: {
        authorization: `bearer ${accessToken}`,
      },
    })

    expect(res.statusCode).toBe(200)
    // SSL settings should not expose passphrase value
    const ssl = res.json().env.ssl ?? {}
    expect(ssl).not.toHaveProperty('passphrase')
  })

  it('GET /auth/settings (unauthenticated - hasInstalledPlugins absent)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/auth/settings',
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().env).not.toHaveProperty('hasInstalledPlugins')
  })

  it('GET /auth/settings (authenticated - exposes hasInstalledPlugins)', async () => {
    const accessToken = (await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: {
        username: 'admin',
        password: 'admin',
      },
    })).json().access_token

    // /auth/settings only reads the flag from the warm installed-plugins
    // cache and never triggers the scan inline (it must not block the
    // bootstrap/login path). Warm the cache first so the flag is exposed.
    await app.get(PluginsService, { strict: false }).getInstalledPlugins()

    const res = await app.inject({
      method: 'GET',
      path: '/auth/settings',
      headers: {
        authorization: `bearer ${accessToken}`,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(typeof res.json().env.hasInstalledPlugins).toBe('boolean')
  })

  it('POST /auth/refresh (valid token)', async () => {
    const accessToken = (await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: {
        username: 'admin',
        password: 'admin',
      },
    })).json().access_token

    const res = await app.inject({
      method: 'POST',
      path: '/auth/refresh',
      headers: {
        authorization: `bearer ${accessToken}`,
      },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json()).toHaveProperty('access_token')
    expect(res.json()).toHaveProperty('token_type', 'Bearer')
    expect(res.json()).toHaveProperty('expires_in')
    // Verify the token is valid (length and structure) - JWT uses base64url which includes - and _ chars
    expect(res.json().access_token).toMatch(RE_JWT)

    // #2893/#2894: bootstrap mints hb-session by calling refresh with the
    // restored Bearer token. The Set-Cookie must be present and scoped to
    // the custom plugin UI path so CookieAuthGuard can accept the iframe.
    const setCookie = res.headers['set-cookie']
    const cookieHeaders = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : []
    const hbSession = cookieHeaders.find(c => c.startsWith('hb-session='))
    expect(hbSession).toBeTruthy()
    expect(hbSession).toContain('HttpOnly')
    expect(hbSession).toContain('Path=/api/plugins/settings-ui/')
    const cookieValue = hbSession!.slice('hb-session='.length).split(';')[0]
    expect(cookieValue).toMatch(RE_JWT)
  })

  it('POST /auth/refresh (invalid token)', async () => {
    const res = await app.inject({
      method: 'POST',
      path: '/auth/refresh',
      headers: {
        authorization: 'bearer invalid-token',
      },
    })

    expect(res.statusCode).toBe(401)
  })

  it('setup-wizard token is rejected once setup wizard completes', async () => {
    // Mint a wizard token (allowed only while setup is incomplete).
    configService.setupWizardComplete = false
    const wizardToken = (await authService.generateSetupWizardToken()).access_token
    configService.setupWizardComplete = true

    const res = await app.inject({
      method: 'GET',
      path: '/auth/check',
      headers: {
        authorization: `bearer ${wizardToken}`,
      },
    })

    expect(res.statusCode).toBe(401)
  })

  it('WsGuard rejects + disconnects when the handshake token is missing', async () => {
    const disconnect = vi.fn()
    const context: any = {
      switchToWs: () => ({
        getClient: () => ({
          handshake: { query: {} },
          disconnect,
        }),
      }),
    }
    const guard = new WsGuard(configService)
    await expect(guard.canActivate(context)).rejects.toThrow(WsException)
    expect(disconnect).toHaveBeenCalled()
  })

  it('WsGuard rejects + disconnects when the handshake token is malformed', async () => {
    const disconnect = vi.fn()
    const context: any = {
      switchToWs: () => ({
        getClient: () => ({
          handshake: { query: { token: 'not.a.valid.jwt' } },
          disconnect,
        }),
      }),
    }
    const guard = new WsGuard(configService)
    await expect(guard.canActivate(context)).rejects.toThrow(WsException)
    expect(disconnect).toHaveBeenCalled()
  })

  it('WsGuard rejects + disconnects an expired token', async () => {
    const jwt = await import('jsonwebtoken')
    const expiredToken = jwt.sign(
      {
        username: 'admin',
        name: 'admin',
        admin: true,
        instanceId: configService.instanceId,
        iat: Math.floor(Date.now() / 1000) - 3600,
        exp: Math.floor(Date.now() / 1000) - 60,
      },
      configService.secrets.secretKey,
    )
    const disconnect = vi.fn()
    const context: any = {
      switchToWs: () => ({
        getClient: () => ({
          handshake: { query: { token: expiredToken } },
          disconnect,
        }),
      }),
    }
    const guard = new WsGuard(configService)
    await expect(guard.canActivate(context)).rejects.toThrow(WsException)
    expect(disconnect).toHaveBeenCalled()
  })

  it('WsAdminGuard rejects a non-admin user even with a valid token', async () => {
    const jwt = await import('jsonwebtoken')
    const nonAdminToken = jwt.sign(
      {
        username: 'someone',
        name: 'Someone',
        admin: false,
        instanceId: configService.instanceId,
      },
      configService.secrets.secretKey,
    )
    const disconnect = vi.fn()
    const context: any = {
      switchToWs: () => ({
        getClient: () => ({
          handshake: { query: { token: nonAdminToken } },
          disconnect,
        }),
      }),
    }
    const guard = new WsAdminGuard(configService)
    expect(await guard.canActivate(context)).toBe(false)
  })

  it('WsGuard disconnects setup-wizard token once setup wizard completes', async () => {
    configService.setupWizardComplete = false
    const wizardToken = (await authService.generateSetupWizardToken()).access_token
    configService.setupWizardComplete = true

    const disconnect = vi.fn()
    const context: any = {
      switchToWs: () => ({
        getClient: () => ({
          handshake: { query: { token: wizardToken } },
          disconnect,
        }),
      }),
    }

    const guard = new WsGuard(configService)
    await expect(guard.canActivate(context)).rejects.toThrow(WsException)
    expect(disconnect).toHaveBeenCalled()
  })

  it('POST /auth/refresh (no token)', async () => {
    const res = await app.inject({
      method: 'POST',
      path: '/auth/refresh',
    })

    expect(res.statusCode).toBe(401)
  })

  it('addUser: parallel adds get distinct ids and no usernames are lost', async () => {
    // Without per-path serialisation both addUser() calls would read
    // the same baseline auth.json, derive the same next id, and the
    // second write would clobber the first.
    const users = await authService.getUsers()
    const baseline = users.length

    const results = await Promise.all([
      authService.addUser({ name: 'Race A', username: 'race-add-a', password: 'race-pw-a', admin: false } as any),
      authService.addUser({ name: 'Race B', username: 'race-add-b', password: 'race-pw-b', admin: false } as any),
    ])

    expect(results[0].id).not.toBe(results[1].id)

    const after = await authService.getUsers()
    expect(after.length).toBe(baseline + 2)
    expect(after.find(u => u.username === 'race-add-a')).toBeDefined()
    expect(after.find(u => u.username === 'race-add-b')).toBeDefined()
    const ids = after.map(u => u.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('verifyOtpToken: parallel duplicate codes can only succeed once', async () => {
    // Two parallel requests with the same captured TOTP code must not
    // both authenticate — the cache slot has to be reserved before
    // awaiting verify(), not after.
    const otpSecret = generateSecret()
    const user = {
      id: 99,
      username: 'otp-race-test',
      name: 'OTP Race',
      admin: false,
      otpActive: true,
      otpSecret,
    }

    const code = await generate({ secret: otpSecret })

    const [r1, r2] = await Promise.all([
      authService.verifyOtpToken(user as any, code),
      authService.verifyOtpToken(user as any, code),
    ])

    expect([r1, r2].filter(Boolean)).toHaveLength(1)
  })

  afterAll(async () => {
    await app.close()
  })
})
