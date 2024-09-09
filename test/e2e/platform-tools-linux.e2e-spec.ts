import { resolve } from 'node:path'
import process from 'node:process'

import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { ValidationPipe } from '@nestjs/common'

import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { copy } from 'fs-extra'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'

import { AuthModule } from '../../src/core/auth/auth.module'
import { LinuxModule } from '../../src/modules/platform-tools/linux/linux.module'
import { LinuxService } from '../../src/modules/platform-tools/linux/linux.service'

describe('PlatformToolsLinux (e2e)', () => {
  let app: NestFastifyApplication

  let authFilePath: string
  let secretsFilePath: string
  let authorization: string
  let restartHostFn: jest.Mock
  let shutdownHostFn: jest.Mock
  let linuxService: LinuxService

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = resolve(__dirname, '../../')
    process.env.UIX_STORAGE_PATH = resolve(__dirname, '../', '.homebridge')
    process.env.UIX_CONFIG_PATH = resolve(process.env.UIX_STORAGE_PATH, 'config.json')

    authFilePath = resolve(process.env.UIX_STORAGE_PATH, 'auth.json')
    secretsFilePath = resolve(process.env.UIX_STORAGE_PATH, '.uix-secrets')

    // setup test config
    await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH)

    // setup test auth file
    await copy(resolve(__dirname, '../mocks', 'auth.json'), authFilePath)
    await copy(resolve(__dirname, '../mocks', '.uix-secrets'), secretsFilePath)

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [LinuxModule, AuthModule],
    }).compile()

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter())

    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      skipMissingProperties: true,
    }))

    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    linuxService = app.get(LinuxService)
  })

  beforeEach(async () => {
    // setup mock functions
    restartHostFn = jest.fn()
    shutdownHostFn = jest.fn()
    linuxService.restartHost = restartHostFn as any
    linuxService.shutdownHost = shutdownHostFn as any

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

  it('GET /platform-tools/linux/restart-host', async () => {
    const res = await app.inject({
      method: 'PUT',
      path: '/platform-tools/linux/restart-host',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(restartHostFn).toHaveBeenCalled()
  })

  it('GET /platform-tools/linux/shutdown-host', async () => {
    const res = await app.inject({
      method: 'PUT',
      path: '/platform-tools/linux/shutdown-host',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(shutdownHostFn).toHaveBeenCalled()
  })

  afterAll(async () => {
    await app.close()
  })
})
