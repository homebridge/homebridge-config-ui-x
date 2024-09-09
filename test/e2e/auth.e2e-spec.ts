import { resolve } from 'node:path'
import process from 'node:process'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from '@jest/globals'
import { ValidationPipe } from '@nestjs/common'

import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { copy, pathExists, remove } from 'fs-extra'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'

import { AuthModule } from '../../src/core/auth/auth.module'
import { AuthService } from '../../src/core/auth/auth.service'
import { ConfigService } from '../../src/core/config/config.service'

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

    // setup test config
    await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH)

    // remove any existing auth / secret files
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
    // setup test auth file
    await copy(resolve(__dirname, '../mocks', 'auth.json'), authFilePath)
    configService.setupWizardComplete = true
  })

  afterEach(async () => {
    // restore auth mode after each test
    const thisConfigService: ConfigService = app.get(ConfigService)
    thisConfigService.ui.auth = 'form'
  })

  it('should .uix-secrets on launch', async () => {
    expect(await pathExists(secretsFilePath)).toBe(true)
  })

  it('should flag first run setup wizard as not complete if authfile not created', async () => {
    // remove test auth file
    await remove(authFilePath)
    await authService.checkAuthFile()
    expect(configService.setupWizardComplete).toBe(false)
  })

  it('should flag first run setup wizard as complete if authfile is created', async () => {
    // test authfile created in beforeEach hook
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
    // set auth mode to none
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

  afterAll(async () => {
    await app.close()
  })
})
