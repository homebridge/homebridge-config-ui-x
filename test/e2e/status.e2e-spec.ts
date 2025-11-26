import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'

import { resolve } from 'node:path'
import process from 'node:process'

import { HttpService } from '@nestjs/axios'
import { ValidationPipe } from '@nestjs/common'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { copy } from 'fs-extra'
import { of } from 'rxjs'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthModule } from '../../src/core/auth/auth.module.js'
import { HomebridgeIpcService } from '../../src/core/homebridge-ipc/homebridge-ipc.service.js'
import { StatusModule } from '../../src/modules/status/status.module.js'

describe('StatusController (e2e)', () => {
  let app: NestFastifyApplication
  let httpService: HttpService
  let ipcService: HomebridgeIpcService

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

    ipcService = app.get(HomebridgeIpcService)
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

  it('GET /status/homebridge (homebridge down)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/status/homebridge',
      headers: {
        authorization,
      },
    })

    // Default status is down
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'down' })
  })

  it('GET /status/homebridge (homebridge up)', async () => {
    // Set homebridge status to up
    ipcService.emit('serverStatusUpdate', { status: 'up' })

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
        version: 'v24.1.0',
        lts: false,
      },
      {
        version: 'v22.12.0',
        lts: 'Jod',
      },
      {
        version: 'v20.19.0',
        lts: 'Iron',
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
    expect(res.json()).toHaveProperty('architecture')
    expect(res.json()).toHaveProperty('supportsNodeJs24')
    expect(res.json().architecture).toBe(process.arch)

    // Test architecture detection logic
    const supportedArchitectures = ['x64', 'arm64', 'ppc64', 's390x']
    const expectedSupport = supportedArchitectures.includes(process.arch)
    expect(res.json().supportsNodeJs24).toBe(expectedSupport)
  })

  it('GET /status/nodejs (architecture-specific recommendations)', async () => {
    const data = [
      {
        version: 'v24.1.0',
        lts: false,
      },
      {
        version: 'v22.12.0',
        lts: 'Jod',
      },
      {
        version: 'v20.19.0',
        lts: 'Iron',
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

    // Test that the endpoint includes the new architecture fields
    expect(res.json()).toHaveProperty('architecture')
    expect(res.json()).toHaveProperty('supportsNodeJs24')
    expect(typeof res.json().supportsNodeJs24).toBe('boolean')
    expect(typeof res.json().architecture).toBe('string')

    // Verify that 64-bit architectures are properly detected
    const supportedArchitectures = ['x64', 'arm64', 'ppc64', 's390x']
    const currentArchSupportsNode24 = supportedArchitectures.includes(res.json().architecture)
    expect(res.json().supportsNodeJs24).toBe(currentArchSupportsNode24)
  })

  afterAll(async () => {
    await app.close()
  })
})
