import { resolve } from 'node:path'
import process from 'node:process'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals'
import { ValidationPipe } from '@nestjs/common'

import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { copy, readFile, readJson, remove, writeFile } from 'fs-extra'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'

import { AuthModule } from '../../src/core/auth/auth.module'
import { ConfigService } from '../../src/core/config/config.service'
import { HbServiceModule } from '../../src/modules/platform-tools/hb-service/hb-service.module'

describe('PlatformToolsHbService (e2e)', () => {
  let app: NestFastifyApplication

  let authFilePath: string
  let secretsFilePath: string
  let envFilePath: string
  let logFilePath: string
  let authorization: string
  let configService: ConfigService

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = resolve(__dirname, '../../')
    process.env.UIX_STORAGE_PATH = resolve(__dirname, '../', '.homebridge')
    process.env.UIX_CONFIG_PATH = resolve(process.env.UIX_STORAGE_PATH, 'config.json')

    authFilePath = resolve(process.env.UIX_STORAGE_PATH, 'auth.json')
    secretsFilePath = resolve(process.env.UIX_STORAGE_PATH, '.uix-secrets')
    envFilePath = resolve(process.env.UIX_STORAGE_PATH, '.uix-hb-service-homebridge-startup.json')
    logFilePath = resolve(process.env.UIX_STORAGE_PATH, 'homebridge.log')

    // setup test config
    await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH)

    // setup test auth file
    await copy(resolve(__dirname, '../mocks', 'auth.json'), authFilePath)
    await copy(resolve(__dirname, '../mocks', '.uix-secrets'), secretsFilePath)

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [HbServiceModule, AuthModule],
    }).compile()

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter())

    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      skipMissingProperties: true,
    }))

    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    configService = app.get(ConfigService)
  })

  beforeEach(async () => {
    // restore hb-service env file
    await copy(resolve(__dirname, '../mocks', '.uix-hb-service-homebridge-startup.json'), envFilePath)

    // ensure restart required flag is cleared
    configService.hbServiceUiRestartRequired = false

    // enable service mode
    configService.serviceMode = true
    configService.ui.log = {
      method: 'file',
      path: logFilePath,
    }

    // get auth token before each test
    authorization = `bearer ${(await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: {
        username: 'admin',
        password: 'admin',
      },
    })).json().access_token}`
  })

  it('GET /platform-tools/hb-service/homebridge-startup-settings (env file exists)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/platform-tools/hb-service/homebridge-startup-settings',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
  })

  it('GET /platform-tools/hb-service/homebridge-startup-settings (env file does not exist)', async () => {
    await remove(envFilePath)

    const res = await app.inject({
      method: 'GET',
      path: '/platform-tools/hb-service/homebridge-startup-settings',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
  })

  it('PUT /platform-tools/hb-service/homebridge-startup-settings', async () => {
    const payload = {
      HOMEBRIDGE_DEBUG: true,
      HOMEBRIDGE_KEEP_ORPHANS: true,
      HOMEBRIDGE_INSECURE: false,
      ENV_DEBUG: '*',
      ENV_NODE_OPTIONS: '--inspect',
    }

    const res = await app.inject({
      method: 'PUT',
      path: '/platform-tools/hb-service/homebridge-startup-settings',
      headers: {
        authorization,
      },
      payload,
    })

    expect(res.statusCode).toBe(200)

    const envFile = await readJson(envFilePath)
    expect(envFile.debugMode).toBe(true)
    expect(envFile.keepOrphans).toBe(true)
    expect(envFile.insecureMode).toBe(false)
    expect(envFile.env.DEBUG).toBe('*')
    expect(envFile.env.NODE_OPTIONS).toBe('--inspect')

    // the restart flag should be set
    expect(configService.hbServiceUiRestartRequired).toBe(true)
  })

  it('PUT /platform-tools/hb-service/set-full-service-restart-flag', async () => {
    // sanity check
    expect(configService.hbServiceUiRestartRequired).toBe(false)

    const res = await app.inject({
      method: 'PUT',
      path: '/platform-tools/hb-service/set-full-service-restart-flag',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(configService.hbServiceUiRestartRequired).toBe(true)
  })

  it('GET /platform-tools/hb-service/log/download', async () => {
    // write some data to the log file
    const sampleLogData = ['line 1', 'line 2', 'line 3'].join('\n')
    await writeFile(logFilePath, sampleLogData)

    const res = await app.inject({
      method: 'GET',
      path: '/platform-tools/hb-service/log/download?colour=no',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual(sampleLogData)
  })

  it('GET /platform-tools/hb-service/log/download (with colour)', async () => {
    // write some data to the log file
    const sampleLogData = ['line 1', 'line 2', 'line 3'].join('\n')
    await writeFile(logFilePath, sampleLogData)

    const res = await app.inject({
      method: 'GET',
      path: '/platform-tools/hb-service/log/download?colour=yes',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual(sampleLogData)
  })

  it('PUT /platform-tools/hb-service/log/truncate', async () => {
    // write some data to the log file
    const sampleLogData = ['line 1', 'line 2', 'line 3'].join('\n')
    await writeFile(logFilePath, sampleLogData)

    const res = await app.inject({
      method: 'PUT',
      path: '/platform-tools/hb-service/log/truncate',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(await readFile(logFilePath, 'utf8')).toBe('')
  })

  afterAll(async () => {
    await app.close()
  })
})
