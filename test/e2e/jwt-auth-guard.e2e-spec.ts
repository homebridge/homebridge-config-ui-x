import type { NestFastifyApplication } from '@nestjs/platform-fastify'

import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import process from 'node:process'

import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { copy, remove } from 'fs-extra'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthModule } from '../../src/core/auth/auth.module.js'
import { describeMissingToken, JwtAuthGuard } from '../../src/core/auth/guards/jwt-auth.guard.js'
import { Logger } from '../../src/core/logger/logger.service.js'

import '../../src/global-defaults.js'

/** Longer than the guard's quiet period, so the next missing token warns again. */
const PAST_QUIET_PERIOD_MS = 11 * 60 * 1000

/**
 * A guarded route answers 401 whether the token is missing or invalid, and the
 * UI signs the user out either way. Only a missing token means something in the
 * path dropped the header, so that is the case the server log has to name.
 */
describe('JwtAuthGuard (e2e)', () => {
  let app: NestFastifyApplication
  let warn: ReturnType<typeof vi.spyOn>

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = resolve(__dirname, '../../')
    process.env.UIX_STORAGE_PATH = resolve(__dirname, '../', '.homebridge')
    process.env.UIX_CONFIG_PATH = resolve(process.env.UIX_STORAGE_PATH, 'config.json')

    await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH)
    await remove(resolve(process.env.UIX_STORAGE_PATH, '.uix-secrets'))

    const moduleFixture = await Test.createTestingModule({
      imports: [AuthModule],
    }).compile()

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    vi.useFakeTimers({
      toFake: ['Date'],
    })
  })

  beforeEach(async () => {
    await copy(resolve(__dirname, '../mocks', 'auth.json'), resolve(process.env.UIX_STORAGE_PATH!, 'auth.json'))
    vi.setSystemTime(Date.now() + PAST_QUIET_PERIOD_MS)
    warn = vi.spyOn(app.get(Logger, { strict: false }), 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warn.mockRestore()
  })

  afterAll(async () => {
    vi.useRealTimers()
    await app.close()
  })

  async function check(headers: Record<string, string> = {}, path = '/auth/check') {
    return app.inject({ method: 'GET', path, headers })
  }

  async function signIn(): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: { username: 'admin', password: 'admin' },
    })
    return res.json().access_token
  }

  /** Everything the guard wrote to the warning log, as one string. */
  function warned(): string {
    return warn.mock.calls.flat().join('\n')
  }

  it('declares an explicit @Inject() for every constructor parameter', () => {
    // tsx emits no design:paramtypes, so a param without one is injected as undefined
    const declared: Array<{ index: number }> = Reflect.getMetadata('self:paramtypes', JwtAuthGuard) ?? []
    expect(declared.map(d => d.index).sort()).toEqual(Array.from({ length: JwtAuthGuard.length }, (_, i) => i))
  })

  it('warns, naming the route and the proxy, when the request has no Authorization header', async () => {
    const res = await check()

    expect(res.statusCode).toBe(401)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warned()).toContain('Rejected GET /auth/check')
    expect(warned()).toContain('no Authorization header')
    expect(warned()).toContain('reverse proxy')
  })

  it('names the scheme a proxy put in place of the bearer token, but never the credential', async () => {
    const res = await check({ authorization: 'Basic dXNlcjpwYXNzd29yZA==' })

    expect(res.statusCode).toBe(401)
    expect(warned()).toContain('"Basic" scheme')
    expect(warned()).not.toContain('dXNlcjpwYXNzd29yZA')
  })

  it('leaves the query string out of the logged path', async () => {
    await check({}, '/auth/check?token=from-the-url')

    expect(warned()).toContain('GET /auth/check:')
    expect(warned()).not.toContain('from-the-url')
  })

  it('stays quiet when the token is present but invalid', async () => {
    const res = await check({ authorization: 'bearer xxxxxxxx' })

    expect(res.statusCode).toBe(401)
    expect(warn).not.toHaveBeenCalled()
  })

  it('stays quiet for a signed-in request', async () => {
    const res = await check({ authorization: `bearer ${await signIn()}` })

    expect(res.statusCode).toBe(200)
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns once per quiet period, then again after it', async () => {
    await check()
    await check()
    await check({ authorization: 'Basic abc' })
    expect(warn).toHaveBeenCalledTimes(1)

    vi.setSystemTime(Date.now() + PAST_QUIET_PERIOD_MS)
    await check()
    expect(warn).toHaveBeenCalledTimes(2)
  })
})

describe('the guard on JWT routes', () => {
  /** The guards that extend the library one. Every other file uses them. */
  const GUARDS_EXTENDING_AUTH_GUARD = new Set([
    join('core', 'auth', 'guards', 'custom.guard.ts'),
    join('core', 'auth', 'guards', 'jwt-auth.guard.ts'),
  ])

  it('is never the library AuthGuard directly', async () => {
    // A route guarded with AuthGuard() still works, so nothing else would notice
    // it had lost the missing-token warning
    const srcDir = resolve(__dirname, '../../src')
    const files = (await readdir(srcDir, { recursive: true })).filter(file => file.endsWith('.ts'))

    const offenders: string[] = []
    for (const file of files) {
      if (!GUARDS_EXTENDING_AUTH_GUARD.has(file) && /\bAuthGuard\(/.test(await readFile(resolve(srcDir, file), 'utf8'))) {
        offenders.push(file)
      }
    }

    expect(offenders).toEqual([])
  })
})

describe('describeMissingToken', () => {
  it.each([
    [undefined, 'the request had no Authorization header'],
    ['', 'the request had no Authorization header'],
    ['Bearer', 'the Authorization header had no token after "Bearer"'],
    ['bearer   ', 'the Authorization header had no token after "Bearer"'],
    ['Basic abc', 'the Authorization header used the "Basic" scheme instead of "Bearer"'],
    ['x\u001B[31mred abc', 'the Authorization header was not a bearer token'],
    ['digest username="a"', 'the Authorization header used the "Digest" scheme instead of "Bearer"'],
    // A bare secret sent as the whole header must never reach the log
    ['hunter2', 'the Authorization header was not a bearer token'],
    ['0123456789abcdef0123456789abcdef', 'the Authorization header was not a bearer token'],
    ['sk-live-abc123 extra', 'the Authorization header was not a bearer token'],
  ])('%j', (header, expected) => {
    expect(describeMissingToken(header)).toBe(expected)
  })
})
