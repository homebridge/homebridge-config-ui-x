import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'

import { Buffer } from 'node:buffer'
import { get } from 'node:http'
import { resolve } from 'node:path'
import process from 'node:process'

import { ValidationPipe } from '@nestjs/common'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { copy, readFile, readJson, remove, writeFile } from 'fs-extra'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { AuthModule } from '../../src/core/auth/auth.module.js'
import { ConfigService } from '../../src/core/config/config.service.js'
import { HbServiceModule } from '../../src/modules/platform-tools/hb-service/hb-service.module.js'

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

    // Setup test config
    await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH)

    // Setup test auth file
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
    // Restore hb-service env file
    await copy(resolve(__dirname, '../mocks', '.uix-hb-service-homebridge-startup.json'), envFilePath)

    // Ensure restart required flag is cleared
    configService.hbServiceUiRestartRequired = false

    configService.ui.log = {
      method: 'file',
      path: logFilePath,
    }

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

    // The restart flag should be set
    expect(configService.hbServiceUiRestartRequired).toBe(true)
  })

  it('PUT /platform-tools/hb-service/set-full-service-restart-flag', async () => {
    // Sanity check
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
    // Write some data to the log file
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

  it('GET /platform-tools/hb-service/log/download (colour=no strips ANSI codes)', async () => {
    const sampleLogData = '\u001B[0;32mgreen text\u001B[0m and \u001B[0;31mred text\u001B[0m'
    await writeFile(logFilePath, sampleLogData)

    const res = await app.inject({
      method: 'GET',
      path: '/platform-tools/hb-service/log/download?colour=no',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain('\u001B[')
    expect(res.body).toContain('green text')
    expect(res.body).toContain('red text')
  })

  it('GET /platform-tools/hb-service/log/download (plain download strips color codes split across chunks)', async () => {
    // The log streams in 64 KiB chunks. Each code here starts a different
    // number of characters before a chunk boundary, so between them they cover
    // every point at which a boundary can cut a code short.
    const colorCode = '\u001B[0;37m'
    const chunkSize = 64 * 1024
    let sampleLogData = ''

    for (let split = 1; split < colorCode.length; split++) {
      sampleLogData += `${'a'.repeat(chunkSize * split - sampleLogData.length - split)}${colorCode}`
    }

    await writeFile(logFilePath, sampleLogData)

    const res = await app.inject({
      method: 'GET',
      path: '/platform-tools/hb-service/log/download?colour=no',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain('\u001B')
    expect(res.body).toBe(sampleLogData.replaceAll(colorCode, ''))
  })

  it('GET /platform-tools/hb-service/log/download (colour=yes preserves ANSI codes)', async () => {
    const sampleLogData = '\u001B[0;32mgreen text\u001B[0m'
    await writeFile(logFilePath, sampleLogData)

    const res = await app.inject({
      method: 'GET',
      path: '/platform-tools/hb-service/log/download?colour=yes',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('\u001B[0;32m')
  })

  it('GET /platform-tools/hb-service/log/download (with colour)', async () => {
    // Write some data to the log file
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

  it.each([
    ['color=yes', true],
    ['color=no', false],
    ['color=yes&colour=no', true],
    ['color=no&colour=yes', false],
  ])('GET /platform-tools/hb-service/log/download?%s (keeps color codes: %s)', async (query, keepsColor) => {
    const sampleLogData = '\u001B[0;32mgreen text\u001B[0m'
    await writeFile(logFilePath, sampleLogData)

    const res = await app.inject({
      method: 'GET',
      path: `/platform-tools/hb-service/log/download?${query}`,
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.body).toBe(keepsColor ? sampleLogData : 'green text')
  })

  it('GET /platform-tools/hb-service/log/download (colored download completes through a slow reader)', async () => {
    // A chunked response fed utf8 strings with multi-byte characters can stall
    // under backpressure (https://github.com/nodejs/node/issues/66781). Injected
    // requests never push back, so this listens on a real socket, with a log
    // large enough to fill the loopback buffers while the reader holds off.
    const sampleLogData = Buffer.from('\u001B[0;36m[Front Door]\u001B[0m ⚡ Motion detected.\n'.repeat(350000))
    await writeFile(logFilePath, sampleLogData)

    await app.listen(0, '127.0.0.1')
    const url = `${await app.getUrl()}/platform-tools/hb-service/log/download?colour=yes`

    const received = await new Promise<Buffer>((resolveDownload, reject) => {
      const req = get(url, {
        headers: { authorization },
      }, (res) => {
        const chunks: Buffer[] = []

        res.pause()
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => resolveDownload(Buffer.concat(chunks)))
        res.on('error', reject)
        setTimeout(() => res.resume(), 250)
      })

      // A stalled download goes quiet rather than failing, so an idle socket
      // fails the test well before the test timeout.
      req.setTimeout(2000, () => req.destroy(new Error('The log download stalled.')))
      req.on('error', reject)
    })

    expect(received.length).toBe(sampleLogData.length)
    expect(received.equals(sampleLogData)).toBe(true)
  })

  it('PUT /platform-tools/hb-service/log/truncate', async () => {
    // Write some data to the log file
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
