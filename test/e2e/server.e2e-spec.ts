import { resolve } from 'node:path'
import process from 'node:process'

import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { ValidationPipe } from '@nestjs/common'

import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { copy, pathExists, readJson, remove, writeJson } from 'fs-extra'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'

import { AuthModule } from '../../src/core/auth/auth.module'

import { ConfigService } from '../../src/core/config/config.service'
import { ServerModule } from '../../src/modules/server/server.module'
import { ServerService } from '../../src/modules/server/server.service'
import type { HomebridgeConfig } from '../../src/core/config/config.service'

describe('ServerController (e2e)', () => {
  let app: NestFastifyApplication

  let authFilePath: string
  let secretsFilePath: string
  let accessoriesPath: string
  let persistPath: string
  let authorization: string
  let configService: ConfigService
  let serverService: ServerService

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = resolve(__dirname, '../../')
    process.env.UIX_STORAGE_PATH = resolve(__dirname, '../', '.homebridge')
    process.env.UIX_CONFIG_PATH = resolve(process.env.UIX_STORAGE_PATH, 'config.json')

    authFilePath = resolve(process.env.UIX_STORAGE_PATH, 'auth.json')
    secretsFilePath = resolve(process.env.UIX_STORAGE_PATH, '.uix-secrets')
    accessoriesPath = resolve(process.env.UIX_STORAGE_PATH, 'accessories')
    persistPath = resolve(process.env.UIX_STORAGE_PATH, 'persist')

    // setup test config
    await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH)

    // setup test auth file
    await copy(resolve(__dirname, '../mocks', 'auth.json'), authFilePath)
    await copy(resolve(__dirname, '../mocks', '.uix-secrets'), secretsFilePath)

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ServerModule, AuthModule],
    }).compile()

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter())

    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      skipMissingProperties: true,
    }))

    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    serverService = await app.get(ServerService)
    configService = await app.get(ConfigService)
  })

  beforeEach(async () => {
    configService.serviceMode = false

    // get auth token before each test
    authorization = `bearer ${(await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: {
        username: 'admin',
        password: 'admin',
      },
    })).json().access_token}`

    // ensure it's clean
    await remove(persistPath)
    await remove(accessoriesPath)

    // copy mock accessories and persist
    await copy(resolve(__dirname, '../mocks', 'persist'), persistPath)
    await copy(resolve(__dirname, '../mocks', 'accessories'), accessoriesPath)
  })

  it('PUT /server/restart', async () => {
    const mockRestartServer = jest.fn()
    serverService.restartServer = mockRestartServer as any

    const res = await app.inject({
      method: 'PUT',
      path: '/server/restart',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(mockRestartServer).toHaveBeenCalled()
  })

  it('GET /server/pairing', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/server/pairing',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      displayName: 'Homebridge Test',
      isPaired: false,
      pincode: '874-99-441',
      setupCode: 'X-HM://0024X0Z3L1FAP',
    })
  })

  it('GET /server/pairing (not ready)', async () => {
    // remove the persist folder
    await remove(persistPath)

    const res = await app.inject({
      method: 'GET',
      path: '/server/pairing',
      headers: {
        authorization,
      },
    })

    // should return 503 - Service Unavailable
    expect(res.statusCode).toBe(503)
  })

  it('PUT /server/reset-homebridge-accessory', async () => {
    const res = await app.inject({
      method: 'PUT',
      path: '/server/reset-homebridge-accessory',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)

    // check the persist and accessories folders were removed
    expect(await pathExists(persistPath)).toBe(false)
    expect(await pathExists(accessoriesPath)).toBe(false)
  })

  it('PUT /server/reset-cached-accessories (service mode enabled)', async () => {
    // enable service mode
    configService.serviceMode = true

    const res = await app.inject({
      method: 'PUT',
      path: '/server/reset-cached-accessories',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
  })

  it('PUT /server/reset-cached-accessories (service mode disabled)', async () => {
    // enable service mode
    configService.serviceMode = false

    const res = await app.inject({
      method: 'PUT',
      path: '/server/reset-cached-accessories',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(400)
  })

  it('GET /server/cached-accessories', async () => {
    // enable service mode
    configService.serviceMode = true

    const res = await app.inject({
      method: 'GET',
      path: '/server/cached-accessories',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(1)
  })

  it('DELETE /server/cached-accessories/:uuid (valid uuid)', async () => {
    // enable service mode
    configService.serviceMode = true

    // sanity check to ensure one cached accessory is preset
    let cachedAccessories = await readJson(resolve(accessoriesPath, 'cachedAccessories'))
    expect(cachedAccessories).toHaveLength(1)

    const res = await app.inject({
      method: 'DELETE',
      path: `/server/cached-accessories/${cachedAccessories[0].UUID}`,
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(204)

    // check the cached accessory was removed
    cachedAccessories = await readJson(resolve(accessoriesPath, 'cachedAccessories'))
    expect(cachedAccessories).toHaveLength(0)
  })

  it('DELETE /server/cached-accessories/:uuid (invalid uuid)', async () => {
    // enable service mode
    configService.serviceMode = true

    // sanity check to ensure one cached accessory is preset
    let cachedAccessories = await readJson(resolve(accessoriesPath, 'cachedAccessories'))
    expect(cachedAccessories).toHaveLength(1)

    const res = await app.inject({
      method: 'DELETE',
      path: '/server/cached-accessories/xxxxxxxx',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(404)

    // check the cached accessory was not removed
    cachedAccessories = await readJson(resolve(accessoriesPath, 'cachedAccessories'))
    expect(cachedAccessories).toHaveLength(1)
  })

  it('GET /server/pairings', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/server/pairings',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(1)
  })

  it('GET /server/pairings/:deviceId', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/server/pairings/67E41F0EA05D',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()._setupCode).toBeDefined()
    expect(res.json()._isPaired).toBe(false)
    expect(res.json()._username).toBe('67:E4:1F:0E:A0:5D')
  })

  it('DELETE /server/pairings/:deviceId', async () => {
    const res = await app.inject({
      method: 'DELETE',
      path: '/server/pairings/67E41F0EA05D',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(204)
  })

  it('GET /server/network-interfaces/system', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/server/network-interfaces/system',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.json())).toBe(true)
  }, 30000)

  it('GET /server/network-interfaces/bridge', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/server/network-interfaces/bridge',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.json())).toBe(true)
  })

  it('PUT /server/network-interfaces/bridge', async () => {
    const res = await app.inject({
      method: 'PUT',
      path: '/server/network-interfaces/bridge',
      headers: {
        authorization,
      },
      payload: {
        adapters: ['en0'],
      },
    })

    expect(res.statusCode).toBe(200)

    // check the value was saved
    const config = await readJson(configService.configPath)
    expect(config.bridge.bind).toEqual(['en0'])
  })

  it('PUT /server/network-interfaces/bridge (no adapters)', async () => {
    const res = await app.inject({
      method: 'PUT',
      path: '/server/network-interfaces/bridge',
      headers: {
        authorization,
      },
      payload: {
        adapters: [],
      },
    })

    expect(res.statusCode).toBe(200)

    // check the value was saved
    const config = await readJson(configService.configPath)
    expect(config.bridge.bind).toBeUndefined()
  })

  it('PUT /server/network-interfaces/bridge (bad payload)', async () => {
    const res = await app.inject({
      method: 'PUT',
      path: '/server/network-interfaces/bridge',
      headers: {
        authorization,
      },
      payload: {
        adapters: 'en0',
      },
    })

    expect(res.statusCode).toBe(400)
    expect(res.body).toContain('adapters must be an array')
  })

  it('GET /server/mdns-advertiser (when not set - default to bonjour-hap)', async () => {
    const config: HomebridgeConfig = await readJson(configService.configPath)
    delete config.bridge.advertiser
    await writeJson(configService.configPath, config)

    const res = await app.inject({
      method: 'GET',
      path: '/server/mdns-advertiser',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ advertiser: 'bonjour-hap' })
  })

  it('GET /server/mdns-advertiser (when set to ciao)', async () => {
    const config: HomebridgeConfig = await readJson(configService.configPath)
    config.bridge.advertiser = 'ciao'
    await writeJson(configService.configPath, config)

    const res = await app.inject({
      method: 'GET',
      path: '/server/mdns-advertiser',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ advertiser: 'ciao' })
  })

  it('GET /server/mdns-advertiser (when set to avahi)', async () => {
    const config: HomebridgeConfig = await readJson(configService.configPath)
    config.bridge.advertiser = 'avahi'
    await writeJson(configService.configPath, config)

    const res = await app.inject({
      method: 'GET',
      path: '/server/mdns-advertiser',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ advertiser: 'avahi' })
  })

  it('GET /server/mdns-advertiser (when set to resolved)', async () => {
    const config: HomebridgeConfig = await readJson(configService.configPath)
    config.bridge.advertiser = 'resolved'
    await writeJson(configService.configPath, config)

    const res = await app.inject({
      method: 'GET',
      path: '/server/mdns-advertiser',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ advertiser: 'resolved' })
  })

  it('PUT /server/mdns-advertiser (bonjour-hap)', async () => {
    const initialConfig: HomebridgeConfig = await readJson(configService.configPath)
    delete initialConfig.bridge.advertiser
    await writeJson(configService.configPath, initialConfig)

    const res = await app.inject({
      method: 'PUT',
      path: '/server/mdns-advertiser',
      headers: {
        authorization,
      },
      payload: {
        advertiser: 'bonjour-hap',
      },
    })

    expect(res.statusCode).toBe(200)

    // check the value was saved
    const config = await readJson(configService.configPath)
    expect(config.bridge.advertiser).toBe('bonjour-hap')
  })

  it('PUT /server/mdns-advertiser (ciao)', async () => {
    const initialConfig: HomebridgeConfig = await readJson(configService.configPath)
    delete initialConfig.mdns
    await writeJson(configService.configPath, initialConfig)

    const res = await app.inject({
      method: 'PUT',
      path: '/server/mdns-advertiser',
      headers: {
        authorization,
      },
      payload: {
        advertiser: 'ciao',
      },
    })

    expect(res.statusCode).toBe(200)

    // check the value was saved
    const config = await readJson(configService.configPath)
    expect(config.bridge.advertiser).toBe('ciao')
  })

  it('PUT /server/mdns-advertiser (avahi)', async () => {
    const initialConfig: HomebridgeConfig = await readJson(configService.configPath)
    delete initialConfig.mdns
    await writeJson(configService.configPath, initialConfig)

    const res = await app.inject({
      method: 'PUT',
      path: '/server/mdns-advertiser',
      headers: {
        authorization,
      },
      payload: {
        advertiser: 'avahi',
      },
    })

    expect(res.statusCode).toBe(200)

    // check the value was saved
    const config = await readJson(configService.configPath)
    expect(config.bridge.advertiser).toBe('avahi')
  })

  it('PUT /server/mdns-advertiser (invalid value)', async () => {
    const initialConfig: HomebridgeConfig = await readJson(configService.configPath)
    delete initialConfig.mdns
    await writeJson(configService.configPath, initialConfig)

    const res = await app.inject({
      method: 'PUT',
      path: '/server/mdns-advertiser',
      headers: {
        authorization,
      },
      payload: {
        advertiser: 'xxxxxxx',
      },
    })

    expect(res.statusCode).toBe(400)
  })

  it('GET /server/port/new', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/server/port/new',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(typeof res.json().port).toBe('number')
    expect(res.json().port).toBeGreaterThanOrEqual(30000)
    expect(res.json().port).toBeLessThanOrEqual(60000)
  })

  afterAll(async () => {
    await app.close()
  })
})
