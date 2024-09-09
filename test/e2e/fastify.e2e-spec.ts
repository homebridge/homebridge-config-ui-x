import { resolve } from 'node:path'
import process from 'node:process'

import fastifyMultipart from '@fastify/multipart'
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'

import { ValidationPipe } from '@nestjs/common'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { fastify } from 'fastify'
import { copy } from 'fs-extra'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'

import { AppModule } from '../../src/app.module'

describe('FastifyOptions (e2e)', () => {
  let app: NestFastifyApplication

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

    // setup test auth file
    await copy(resolve(__dirname, '../mocks', 'auth.json'), authFilePath)
    await copy(resolve(__dirname, '../mocks', '.uix-secrets'), secretsFilePath)

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    // setup fastify
    const server = fastify({
      logger: true,
    })

    const fAdapter = new FastifyAdapter(server)

    fAdapter.register(fastifyMultipart, {
      limits: {
        files: 1,
      },
    })

    app = moduleFixture.createNestApplication<NestFastifyApplication>(fAdapter)

    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      skipMissingProperties: true,
    }))

    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })

  it('GET /', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/',
    })

    expect(res.statusCode).toBe(200)
    expect(res.body).toBe('Hello World!')
  })

  afterAll(async () => {
    await app.close()
  })
})
