import { resolve } from 'node:path'
import process from 'node:process'

import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { ValidationPipe } from '@nestjs/common'

import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { copy, readFile } from 'fs-extra'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'

import { AuthModule } from '../../src/core/auth/auth.module'
import { DockerModule } from '../../src/modules/platform-tools/docker/docker.module'
import { DockerService } from '../../src/modules/platform-tools/docker/docker.service'

describe('PlatformToolsDocker (e2e)', () => {
  let app: NestFastifyApplication

  let authFilePath: string
  let secretsFilePath: string
  let startupFilePath: string
  let authorization: string
  let restartDockerContainerFn: jest.Mock
  let dockerService: DockerService

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = resolve(__dirname, '../../')
    process.env.UIX_STORAGE_PATH = resolve(__dirname, '../', '.homebridge')
    process.env.UIX_CONFIG_PATH = resolve(process.env.UIX_STORAGE_PATH, 'config.json')

    authFilePath = resolve(process.env.UIX_STORAGE_PATH, 'auth.json')
    secretsFilePath = resolve(process.env.UIX_STORAGE_PATH, '.uix-secrets')
    startupFilePath = resolve(process.env.UIX_STORAGE_PATH, 'startup.sh')

    // setup test config
    await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH)

    // setup test auth file
    await copy(resolve(__dirname, '../mocks', 'auth.json'), authFilePath)
    await copy(resolve(__dirname, '../mocks', '.uix-secrets'), secretsFilePath)

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [DockerModule, AuthModule],
    }).compile()

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter())

    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      skipMissingProperties: true,
    }))

    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    dockerService = app.get(DockerService)
  })

  beforeEach(async () => {
    // setup mock functions
    restartDockerContainerFn = jest.fn()
    dockerService.restartDockerContainer = restartDockerContainerFn as any

    // restore startup.sh
    await copy(resolve(__dirname, '../mocks', 'startup.sh'), startupFilePath)

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

  it('GET /platform-tools/docker/startup-script', async () => {
    const startupScript = await readFile(startupFilePath, 'utf8')

    const res = await app.inject({
      method: 'GET',
      path: '/platform-tools/docker/startup-script',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().script).toEqual(startupScript)
  })

  it('PUT /platform-tools/docker/startup-script', async () => {
    const startupScript = 'Hello World!'

    const res = await app.inject({
      method: 'PUT',
      path: '/platform-tools/docker/startup-script',
      headers: {
        authorization,
      },
      payload: {
        script: startupScript,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(await readFile(startupFilePath, 'utf8')).toEqual(startupScript)
  })

  it('GET /platform-tools/docker/restart-container', async () => {
    const res = await app.inject({
      method: 'PUT',
      path: '/platform-tools/docker/restart-container',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(restartDockerContainerFn).toHaveBeenCalled()
  })

  afterAll(async () => {
    await app.close()
  })
})
