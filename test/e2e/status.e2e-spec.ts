import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'

import { resolve } from 'node:path'
import process from 'node:process'

import { HttpService } from '@nestjs/axios'
import { ValidationPipe } from '@nestjs/common'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { copy } from 'fs-extra'
import { of, throwError } from 'rxjs'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthModule } from '../../src/core/auth/auth.module'
import { StatusModule } from '../../src/modules/status/status.module'

describe('StatusController (e2e)', () => {
  let app: NestFastifyApplication
  let httpService: HttpService

  let authFilePath: string
  let secretsFilePath: string
  let authorization: string

  beforeAll(async () => {
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
      imports: [StatusModule, AuthModule],
    }).overrideProvider(HttpService).useValue(httpService).compile()

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter())

    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      skipMissingProperties: true,
    }))

    await app.init()
    await app.getHttpAdapter().getInstance().ready()
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

  it('GET /status/cpu', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/status/cpu',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveProperty('cpuLoadHistory')
    expect(res.json()).toHaveProperty('cpuTemperature')
    expect(res.json()).toHaveProperty('currentLoad')
  }, 30000)

  it('GET /status/ram', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/status/ram',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveProperty('mem')
    expect(res.json()).toHaveProperty('memoryUsageHistory')
  }, 30000)

  it('GET /status/network', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/status/network',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveProperty('net')
    expect(res.json()).toHaveProperty('point')
  }, 30000)

  it('GET /status/uptime', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/status/uptime',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveProperty('time')
    expect(res.json()).toHaveProperty('processUptime')
  })

  it('GET /status/homebridge (homebridge up)', async () => {
    const response: AxiosResponse<any> = {
      data: {},
      headers: {},
      config: { url: 'http://localhost:51826' } as InternalAxiosRequestConfig,
      status: 404,
      statusText: 'Not Found',
    }

    vi.spyOn(httpService, 'get').mockImplementationOnce(() => of(response) as any)

    const res = await app.inject({
      method: 'GET',
      path: '/status/homebridge',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'up' })
  })

  it('GET /status/homebridge (homebridge down)', async () => {
    const response: AxiosError<any> = {
      name: 'Connection Error',
      message: 'Connection Error',
      toJSON: () => {
        return {}
      },
      isAxiosError: true,
      code: null,
      response: null,
      config: { url: 'http://localhost:51826' } as InternalAxiosRequestConfig,
    }

    vi.spyOn(httpService, 'get')
      .mockImplementationOnce(() => throwError(() => response))

    const res = await app.inject({
      method: 'GET',
      path: '/status/homebridge',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'down' })
  })

  it('GET /status/server-information', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/status/server-information',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveProperty('serviceUser')
    expect(res.json().homebridgeConfigJsonPath).toBe(process.env.UIX_CONFIG_PATH)
    expect(res.json().homebridgeStoragePath).toBe(process.env.UIX_STORAGE_PATH)
  }, 30000)

  it('GET /status/nodejs', async () => {
    const data = [
      {
        version: 'v21.6.1',
        lts: false,
      },
      {
        version: 'v20.12.2',
        lts: 'Iron',
      },
      {
        version: 'v18.19.0',
        lts: 'Hydrogen',
      },
      {
        version: 'v16.20.2',
        lts: 'Gallium',
      },
    ]

    const response: AxiosResponse<any> = {
      data,
      headers: {},
      config: { url: 'https://nodejs.org/dist/index.json' } as InternalAxiosRequestConfig,
      status: 200,
      statusText: 'OK',
    }

    vi.spyOn(httpService, 'get').mockImplementationOnce(() => of(response) as any)

    const res = await app.inject({
      method: 'GET',
      path: '/status/nodejs',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().currentVersion).toEqual(process.version)
    // expect(res.json().latestVersion).toBe('v20.14.0' || 'v22.3.0');
  })

  afterAll(async () => {
    await app.close()
  })
})
