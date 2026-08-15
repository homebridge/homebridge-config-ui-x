import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'

import { resolve } from 'node:path'
import process from 'node:process'

import { HttpException, ValidationPipe } from '@nestjs/common'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { WsException } from '@nestjs/websockets'
import { copy, pathExists, readJson, remove } from 'fs-extra'
import { generate, generateSecret } from 'otplib'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthModule } from '../../src/core/auth/auth.module.js'
import { AuthService } from '../../src/core/auth/auth.service.js'
import { WsAdminGuard } from '../../src/core/auth/guards/ws-admin-guard.js'
import { WsLogGuard } from '../../src/core/auth/guards/ws-log.guard.js'
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

  it('setupFirstUser only creates one admin under concurrent onboarding requests', async () => {
    // Simulate first run: no auth file, wizard not complete
    await remove(authFilePath)
    await authService.checkAuthFile()
    expect(configService.setupWizardComplete).toBe(false)

    // Two requests arriving together. Without the synchronous reservation both
    // would pass the setupWizardComplete check and each create an administrator.
    const results = await Promise.allSettled([
      authService.setupFirstUser({ username: 'firstadmin', password: 'passwordone', name: 'First' } as any),
      authService.setupFirstUser({ username: 'secondadmin', password: 'passwordtwo', name: 'Second' } as any),
    ])

    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1)

    // Exactly one user exists in the auth file
    const users = await authService.getUsers()
    expect(users).toHaveLength(1)

    // Restore state for following tests
    await copy(resolve(__dirname, '../mocks', 'auth.json'), authFilePath)
    configService.setupWizardComplete = true
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
    const cookies = Array.isArray(res.headers['set-cookie']) ? res.headers['set-cookie'] : [res.headers['set-cookie']]
    expect(cookies.some(cookie => cookie?.startsWith('hb-refresh='))).toBe(true)
    expect(cookies.some(cookie => cookie?.startsWith('hb-session='))).toBe(false)
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

  it('upgrades a legacy weak password hash on successful login', async () => {
    // The mock auth file is a legacy record: hashed at 1,000 iterations with
    // no stored iteration count.
    const before = await readJson(authFilePath)
    expect(before[0].passwordIterations).toBeUndefined()

    // A correct login verifies against the legacy count, then re-hashes at the
    // current work factor and persists it.
    await authService.authenticate('admin', 'admin')

    const after = await readJson(authFilePath)
    expect(after[0].passwordIterations).toBe(210000)
    expect(after[0].hashedPassword).not.toBe(before[0].hashedPassword)
    expect(after[0].salt).not.toBe(before[0].salt)

    // The upgraded record still authenticates, and an upgraded record is not
    // re-hashed again.
    await expect(authService.authenticate('admin', 'admin')).resolves.toBeTruthy()
    const again = await readJson(authFilePath)
    expect(again[0].hashedPassword).toBe(after[0].hashedPassword)
  })

  it('rejects a token whose user has been deleted', async () => {
    const created: any = await authService.addUser({ name: 'Temp', username: 'temp-deleted', password: 'temp-pw', admin: false } as any)
    const payload = await authService.authenticate('temp-deleted', 'temp-pw')
    expect(await authService.validateUser(payload)).toBeTruthy()

    await authService.deleteUser(created.id)

    // Previously the payload was returned unchecked, so the token kept working
    // until it expired (eight hours by default).
    expect(await authService.validateUser(payload)).toBeNull()
  })

  it('rejects a token whose user has been demoted from admin', async () => {
    const created: any = await authService.addUser({ name: 'Demote', username: 'temp-demote', password: 'temp-pw', admin: true } as any)
    const payload = await authService.authenticate('temp-demote', 'temp-pw')
    expect(payload.admin).toBe(true)
    expect(await authService.validateUser(payload)).toBeTruthy()

    await authService.updateUser(created.id, { name: 'Demote', username: 'temp-demote', admin: false } as any)

    expect(await authService.validateUser(payload)).toBeNull()
  })

  it('rejects a token issued before the password was changed', async () => {
    await authService.addUser({ name: 'Rotate', username: 'temp-rotate', password: 'old-password', admin: false } as any)
    const payload = await authService.authenticate('temp-rotate', 'old-password')
    expect(await authService.validateUser(payload)).toBeTruthy()

    await authService.updateOwnPassword('temp-rotate', 'old-password', 'new-password')

    expect(await authService.validateUser(payload)).toBeNull()
  })

  it('exchanges the session cookie for a token, and logout revokes it', async () => {
    // Log in and keep the HttpOnly cookies the server sets.
    const login = await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: { username: 'admin', password: 'admin' },
    })
    expect(login.statusCode).toBe(201)
    const header = login.headers['set-cookie']
    const setCookies = (Array.isArray(header) ? header : [header]) as string[]
    const refreshCookie = setCookies.find(c => c.startsWith('hb-refresh='))!
    expect(refreshCookie).toBeDefined()
    // The token must not be reachable from JavaScript, which is the whole point
    // of moving it out of localStorage.
    expect(refreshCookie).toContain('HttpOnly')
    expect(refreshCookie).toContain('SameSite=Strict')
    const cookieValue = refreshCookie.split(';')[0]

    // A page load exchanges the cookie for a fresh access token.
    const restored = await app.inject({
      method: 'POST',
      path: '/auth/session',
      headers: { cookie: cookieValue },
    })
    expect(restored.statusCode).toBe(201)
    expect(restored.json()).toHaveProperty('access_token')

    // Without the cookie there is nothing to restore.
    const anonymous = await app.inject({ method: 'POST', path: '/auth/session' })
    expect(anonymous.statusCode).toBe(401)

    // Logout must clear the cookie, or a reload would silently restore the
    // session the user just ended.
    const loggedOut = await app.inject({
      method: 'POST',
      path: '/auth/logout',
      headers: { authorization: `Bearer ${restored.json().access_token}` },
    })
    expect(loggedOut.statusCode).toBe(201)
    const clearedHeader = loggedOut.headers['set-cookie']
    const cleared = (Array.isArray(clearedHeader) ? clearedHeader : [clearedHeader]) as string[]
    expect(cleared.some(c => c.startsWith('hb-refresh=') && c.includes('Max-Age=0'))).toBe(true)
    expect(cleared.some(c => c.startsWith('hb-session='))).toBe(false)
  })

  it('clears session cookies when logout receives an invalid bearer token', async () => {
    const loggedOut = await app.inject({
      method: 'POST',
      path: '/auth/logout',
      headers: { authorization: 'Bearer invalid-token' },
    })
    const setCookie = loggedOut.headers['set-cookie']
    const cleared = (Array.isArray(setCookie) ? setCookie : [setCookie]) as string[]

    expect(loggedOut.statusCode).toBe(201)
    expect(cleared.some(cookie => cookie.startsWith('hb-refresh=') && cookie.includes('Max-Age=0'))).toBe(true)
  })

  it('locks out repeated failed logins', async () => {
    // A bogus username keeps this isolated from the admin account other tests
    // use. 11 attempts = the 10-failure threshold plus one that trips the lockout.
    let last: any
    for (let i = 0; i < 11; i++) {
      last = await authService.authenticate('bruteforce', 'wrong-password').catch((e: any) => e)
    }

    // The attempt past the threshold is rejected before any password work with 429.
    expect(last).toBeInstanceOf(HttpException)
    expect(last.getStatus()).toBe(429)
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
    const cookies = Array.isArray(res.headers['set-cookie']) ? res.headers['set-cookie'] : [res.headers['set-cookie']]
    expect(cookies.some(cookie => cookie?.startsWith('hb-refresh='))).toBe(true)
    expect(cookies.some(cookie => cookie?.startsWith('hb-session='))).toBe(false)
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

  it('GET /auth/settings (unauthenticated - exposes temperatureUnits for plugins)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/auth/settings',
    })

    expect(res.statusCode).toBe(200)
    expect(['c', 'f']).toContain(res.json().env.temperatureUnits)
  })

  it('GET /auth/settings (unauthenticated - hasInstalledPlugins absent)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/auth/settings',
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().env).not.toHaveProperty('hasInstalledPlugins')
  })

  // ⚠️ Pins the asymmetry that the UI has to work around: these keys are only
  // sent to an authorised caller. SettingsService fetches settings once from its
  // own constructor, before the access token exists, so AuthService.loadToken()
  // has to fetch them a second time once it has one. Without that, the whole
  // session runs on the unauthenticated subset and `enableAccessories` reads as
  // undefined — the accessories page then tells users to enable insecure mode
  // when it is already on.
  it('GET /auth/settings (authorised-only keys are withheld when unauthenticated)', async () => {
    const authorisedOnly = ['enableAccessories', 'enableTerminalAccess', 'restrictLogsToAdmins']

    const anonymous = await app.inject({ method: 'GET', path: '/auth/settings' })
    expect(anonymous.statusCode).toBe(200)
    for (const key of authorisedOnly) {
      expect(anonymous.json().env).not.toHaveProperty(key)
    }

    const accessToken = (await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: { username: 'admin', password: 'admin' },
    })).json().access_token

    const authorised = await app.inject({
      method: 'GET',
      path: '/auth/settings',
      headers: { authorization: `bearer ${accessToken}` },
    })
    expect(authorised.statusCode).toBe(200)
    for (const key of authorisedOnly) {
      expect(authorised.json().env).toHaveProperty(key)
    }
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

    const cookies = Array.isArray(res.headers['set-cookie']) ? res.headers['set-cookie'] : [res.headers['set-cookie']]
    expect(cookies.some(cookie => cookie?.startsWith('hb-refresh='))).toBe(true)
    expect(cookies.some(cookie => cookie?.startsWith('hb-session='))).toBe(false)
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
    const guard = app.get(WsGuard)
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
    const guard = app.get(WsGuard)
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
    const guard = app.get(WsGuard)
    await expect(guard.canActivate(context)).rejects.toThrow(WsException)
    expect(disconnect).toHaveBeenCalled()
  })

  it('WsAdminGuard rejects a non-admin user even with a valid token', async () => {
    // The user has to exist in the auth file: a token naming a user who is not
    // there is now rejected outright rather than returning false.
    await authService.addUser({ name: 'Someone', username: 'someone', password: 'someone-pw', admin: false } as any)

    const jwt = await import('jsonwebtoken')
    const nonAdminToken = jwt.sign(
      {
        username: 'someone',
        name: 'Someone',
        admin: false,
        instanceId: configService.instanceId,
        sessionVersion: 0,
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
    const guard = app.get(WsAdminGuard)
    expect(await guard.canActivate(context)).toBe(false)
  })

  it('WsGuard accepts a token from the handshake auth payload', async () => {
    // Clients send the token in `auth` so it does not end up in the URL (and
    // therefore in proxy and access logs). The `query` form is still accepted
    // for a browser running a pre-upgrade bundle, which the other guard tests
    // above exercise.
    const token = (await authService.signIn('admin', 'admin')).access_token
    const disconnect = vi.fn()
    const context: any = {
      switchToWs: () => ({
        getClient: () => ({
          handshake: { auth: { token }, query: {} },
          disconnect,
        }),
      }),
    }

    expect(await app.get(WsGuard).canActivate(context)).toBe(true)
    expect(disconnect).not.toHaveBeenCalled()
  })

  it('WsLogGuard follows the restrictLogsToAdmins setting', async () => {
    await authService.addUser({ name: 'Log Reader', username: 'log-reader', password: 'log-reader-pw', admin: false } as any)
    const nonAdmin = (await authService.signIn('log-reader', 'log-reader-pw')).access_token
    const admin = (await authService.signIn('admin', 'admin')).access_token

    const contextFor = (token: string) => ({
      switchToWs: () => ({
        getClient: () => ({ handshake: { auth: { token } }, disconnect: vi.fn() }),
      }),
    }) as any

    const guard = app.get(WsLogGuard)

    // Default: the log is readable by any signed-in user, which is the
    // long-standing behaviour and must not change on upgrade.
    configService.restrictLogsToAdmins = false
    expect(await guard.canActivate(contextFor(nonAdmin))).toBe(true)
    expect(await guard.canActivate(contextFor(admin))).toBe(true)

    // Restricted: administrators only.
    configService.restrictLogsToAdmins = true
    expect(await guard.canActivate(contextFor(nonAdmin))).toBe(false)
    expect(await guard.canActivate(contextFor(admin))).toBe(true)

    configService.restrictLogsToAdmins = false
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

    const guard = app.get(WsGuard)
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
