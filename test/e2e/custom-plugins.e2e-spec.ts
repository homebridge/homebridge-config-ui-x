import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'

import { resolve } from 'node:path'
import process from 'node:process'

import { HttpService } from '@nestjs/axios'
import { ValidationPipe } from '@nestjs/common'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { copy, remove, writeJson } from 'fs-extra'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthModule } from '../../src/core/auth/auth.module.js'
import { CustomPluginsModule } from '../../src/modules/custom-plugins/custom-plugins.module.js'

describe('CustomPluginsController (e2e)', () => {
  let app: NestFastifyApplication
  let httpService: HttpService

  let authFilePath: string
  let secretsFilePath: string
  let authorization: string

  beforeAll(async () => {
    vi.resetAllMocks()

    process.env.UIX_BASE_PATH = resolve(__dirname, '../../')
    process.env.UIX_STORAGE_PATH = resolve(__dirname, '../', '.homebridge')
    process.env.UIX_CONFIG_PATH = resolve(process.env.UIX_STORAGE_PATH, 'config.json')

    authFilePath = resolve(process.env.UIX_STORAGE_PATH, 'auth.json')
    secretsFilePath = resolve(process.env.UIX_STORAGE_PATH, '.uix-secrets')

    // Setup test config
    await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH)

    // Setup test auth file
    await copy(resolve(__dirname, '../mocks', 'auth.json'), authFilePath)
    await copy(resolve(__dirname, '../mocks', '.uix-secrets'), secretsFilePath)

    // create httpService instance
    httpService = new HttpService()

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [CustomPluginsModule, AuthModule],
    }).overrideProvider(HttpService).useValue(httpService).compile()

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter())

    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      skipMissingProperties: true,
    }))

    await app.init()
    await app.getHttpAdapter().getInstance().ready()
    httpService = app.get(HttpService)
  })

  beforeEach(async () => {
    vi.resetAllMocks()

    // Get auth token before each test
    authorization = `bearer ${(await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: {
        username: 'admin',
        password: 'admin',
      },
    })).json().access_token}`
  })

  it('GET /plugins/custom-plugins/homebridge-hue/dump-file (dump file exists)', async () => {
    await writeJson(resolve(process.env.UIX_STORAGE_PATH, 'homebridge-hue.json.gz'), {})

    const res = await app.inject({
      method: 'GET',
      path: '/plugins/custom-plugins/homebridge-hue/dump-file',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
  })

  it('GET /plugins/custom-plugins/homebridge-hue/dump-file (dump file missing)', async () => {
    await remove(resolve(process.env.UIX_STORAGE_PATH, 'homebridge-hue.json.gz'))

    const res = await app.inject({
      method: 'GET',
      path: '/plugins/custom-plugins/homebridge-hue/dump-file',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(404)
  })

  it('GET /plugins/custom-plugins/homebridge-deconz/dump-file (dump file exists)', async () => {
    await writeJson(resolve(process.env.UIX_STORAGE_PATH, 'homebridge-deconz.json.gz'), {})

    const res = await app.inject({
      method: 'GET',
      path: '/plugins/custom-plugins/homebridge-deconz/dump-file',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
  })

  it('GET /plugins/custom-plugins/homebridge-deconz/dump-file (dump file missing)', async () => {
    await remove(resolve(process.env.UIX_STORAGE_PATH, 'homebridge-deconz.json.gz'))

    const res = await app.inject({
      method: 'GET',
      path: '/plugins/custom-plugins/homebridge-deconz/dump-file',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(404)
  })

  afterAll(async () => {
    await app.close()
  })
})
