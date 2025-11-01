import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'

import type { HomebridgeConfig } from '../../src/core/config/config.interfaces.js'

import { resolve } from 'node:path'
import process from 'node:process'

import fastifyMultipart from '@fastify/multipart'
import { ValidationPipe } from '@nestjs/common'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import FormData from 'form-data'
import { copy, ensureDir, pathExists, readFile, readJson, remove, writeJson } from 'fs-extra'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthModule } from '../../src/core/auth/auth.module.js'
import { ConfigService } from '../../src/core/config/config.service.js'
import { ServerModule } from '../../src/modules/server/server.module.js'
import { ServerService } from '../../src/modules/server/server.service.js'

import '../../src/globalDefaults'

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

    // Setup test config
    await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH)

    // Setup test auth file
    await copy(resolve(__dirname, '../mocks', 'auth.json'), authFilePath)
    await copy(resolve(__dirname, '../mocks', '.uix-secrets'), secretsFilePath)

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ServerModule, AuthModule],
    }).compile()

    const fAdapter = new FastifyAdapter()

    fAdapter.register(fastifyMultipart, {
      limits: {
        files: 1,
        fileSize: globalThis.backup.maxBackupSize,
      },
    })

    app = moduleFixture.createNestApplication<NestFastifyApplication>(fAdapter)

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
    // Get auth token before each test
    authorization = `bearer ${(await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: {
        username: 'admin',
        password: 'admin',
      },
    })).json().access_token}`

    // Ensure it's clean
    await remove(persistPath)
    await remove(accessoriesPath)

    // copy mock accessories and persist
    await copy(resolve(__dirname, '../mocks', 'persist'), persistPath)
    await copy(resolve(__dirname, '../mocks', 'accessories'), accessoriesPath)
  })

  it('PUT /server/restart', async () => {
    const mockRestartServer = vi.fn()
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
    // Remove the persist folder
    await remove(persistPath)

    const res = await app.inject({
      method: 'GET',
      path: '/server/pairing',
      headers: {
        authorization,
      },
    })

    // Should return 503 - Service Unavailable
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

  it('PUT /server/reset-cached-accessories', async () => {
    const res = await app.inject({
      method: 'PUT',
      path: '/server/reset-cached-accessories',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
  })

  it('GET /server/cached-accessories', async () => {
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
    // Sanity check to ensure one cached accessory is preset
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
    // Sanity check to ensure one cached accessory is preset
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

  it('POST /server/wallpaper', async () => {
    // create multipart form
    const payload = new FormData()
    payload.append('wallpaper', await readFile(resolve(__dirname, '../mocks/persist/wallpaper.png')), 'wallpaper.png')

    const headers = payload.getHeaders()
    headers.authorization = authorization

    const res = await app.inject({
      method: 'POST',
      path: '/server/wallpaper',
      headers,
      payload,
    })

    expect(res.statusCode).toBe(201)

    await new Promise(r => setTimeout(r, 100))

    // Two things to ensure:
    // 1. The wallpaper was saved to the correct location
    const wallpaperPath = resolve(process.env.UIX_STORAGE_PATH, 'ui-wallpaper.png')
    expect(await pathExists(wallpaperPath)).toBe(true)

    // 2. The wallpaper was set in the config
    const config = await readJson(configService.configPath)
    expect(config.platforms[0].wallpaper).toBe('ui-wallpaper.png')
  })

  it('DELETE /server/wallpaper', async () => {
    // Create wallpaper first (same as test above)
    const payload = new FormData()
    payload.append('wallpaper', await readFile(resolve(__dirname, '../mocks/persist/wallpaper.png')), 'wallpaper.png')

    const headers = payload.getHeaders()
    headers.authorization = authorization

    const res = await app.inject({
      method: 'POST',
      path: '/server/wallpaper',
      headers,
      payload,
    })

    expect(res.statusCode).toBe(201)

    await new Promise(r => setTimeout(r, 100))

    // Now delete the wallpaper
    const deleteRes = await app.inject({
      method: 'DELETE',
      path: '/server/wallpaper',
      headers,
    })

    expect(deleteRes.statusCode).toBe(204)

    // Check the wallpaper file was removed
    const wallpaperPath = resolve(process.env.UIX_STORAGE_PATH, 'ui-wallpaper.png')
    expect(await pathExists(wallpaperPath)).toBe(false)

    // Check the config file was updated
    const config = await readJson(configService.configPath)
    expect(config.platforms[0].wallpaper).toBeUndefined()
  })

  it('GET /server/matter-accessories (should return empty array when no Matter storage)', async () => {
    // Ensure no Matter directory exists
    const matterPath = resolve(process.env.UIX_STORAGE_PATH, 'matter')
    await remove(matterPath)

    const res = await app.inject({
      method: 'GET',
      path: '/server/matter-accessories',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.json())).toBe(true)
    expect(res.json()).toHaveLength(0)
  })

  it('GET /server/matter-accessories (should return accessories from all devices)', async () => {
    // Copy mock Matter storage
    const matterPath = resolve(process.env.UIX_STORAGE_PATH, 'matter')
    await copy(resolve(__dirname, '../mocks', 'matter'), matterPath)

    const res = await app.inject({
      method: 'GET',
      path: '/server/matter-accessories',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    const accessories = res.json()
    expect(Array.isArray(accessories)).toBe(true)
    expect(accessories.length).toBeGreaterThan(0)

    // Verify structure
    const firstAccessory = accessories[0]
    expect(firstAccessory).toHaveProperty('uuid')
    expect(firstAccessory).toHaveProperty('$deviceId')
    expect(firstAccessory).toHaveProperty('$protocol', 'matter')

    // Cleanup
    await remove(matterPath)
  })

  it('DELETE /server/matter-accessories/:deviceId/:uuid (should remove single Matter accessory)', async () => {
    // Setup: Copy mock Matter storage
    const matterPath = resolve(process.env.UIX_STORAGE_PATH, 'matter')
    await copy(resolve(__dirname, '../mocks', 'matter'), matterPath)

    const deviceId = '67E41F0EA05D'
    const uuid = 'matter-test-accessory-uuid-1'

    const res = await app.inject({
      method: 'DELETE',
      path: `/server/matter-accessories/${deviceId}/${uuid}`,
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(204)

    // Verify accessory was removed from the file
    const accessoriesPath = resolve(matterPath, deviceId, 'accessories.json')
    const accessories = await readJson(accessoriesPath)
    expect(accessories.find(a => a.uuid === uuid)).toBeUndefined()

    // Cleanup
    await remove(matterPath)
  })

  it('DELETE /server/matter-accessories/:deviceId/:uuid (should return 404 if accessories file not found)', async () => {
    const deviceId = 'NONEXISTENT'
    const uuid = 'some-uuid'

    const res = await app.inject({
      method: 'DELETE',
      path: `/server/matter-accessories/${deviceId}/${uuid}`,
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(404)
  })

  it('DELETE /server/matter-accessories/:deviceId/:uuid (should return 404 if uuid not found)', async () => {
    // Setup: Copy mock Matter storage
    const matterPath = resolve(process.env.UIX_STORAGE_PATH, 'matter')
    await copy(resolve(__dirname, '../mocks', 'matter'), matterPath)

    const deviceId = '67E41F0EA05D'
    const uuid = 'nonexistent-uuid'

    const res = await app.inject({
      method: 'DELETE',
      path: `/server/matter-accessories/${deviceId}/${uuid}`,
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(404)

    // Cleanup
    await remove(matterPath)
  })

  it('DELETE /server/matter-accessories (should remove multiple Matter accessories)', async () => {
    // Setup: Copy mock Matter storage
    const matterPath = resolve(process.env.UIX_STORAGE_PATH, 'matter')
    await copy(resolve(__dirname, '../mocks', 'matter'), matterPath)

    const accessoriesToDelete = [
      { deviceId: '67E41F0EA05D', uuid: 'matter-test-accessory-uuid-1' },
      { deviceId: '67E41F0EA05D', uuid: 'matter-test-accessory-uuid-2' },
    ]

    const res = await app.inject({
      method: 'DELETE',
      path: '/server/matter-accessories',
      headers: {
        authorization,
      },
      payload: accessoriesToDelete,
    })

    expect(res.statusCode).toBe(204)

    // Verify accessories were removed
    const accessoriesPath = resolve(matterPath, '67E41F0EA05D', 'accessories.json')
    const accessories = await readJson(accessoriesPath)
    expect(accessories).toHaveLength(0)

    // Cleanup
    await remove(matterPath)
  })

  it('GET /server/port/new/matter (should return port in Matter range)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/server/port/new/matter',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(typeof res.json().port).toBe('number')
    expect(res.json().port).toBeGreaterThanOrEqual(5530)
    expect(res.json().port).toBeLessThanOrEqual(5541)
  })

  it('GET /server/port/new/matter (should avoid already used ports)', async () => {
    // Set up config with some used Matter ports
    const config = await readJson(configService.configPath)
    config.bridge.matter = { port: 5530 }
    config.platforms = [
      {
        name: 'Test Plugin',
        _bridge: {
          username: '0E:02:9A:9D:44:45',
          matter: {
            port: 5531,
          },
        },
      },
    ]
    await writeJson(configService.configPath, config)

    const res = await app.inject({
      method: 'GET',
      path: '/server/port/new/matter',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    const returnedPort = res.json().port
    expect(returnedPort).not.toBe(5530)
    expect(returnedPort).not.toBe(5531)
    expect(returnedPort).toBeGreaterThanOrEqual(5530)
    expect(returnedPort).toBeLessThanOrEqual(5541)
  })

  it('DELETE /server/pairings/:deviceId/matter (should remove Matter config from child bridge)', async () => {
    // Setup: Create config with Matter enabled on a child bridge
    const config = await readJson(configService.configPath)
    const deviceId = '0E029A9D4445'
    const username = '0E:02:9A:9D:44:45'

    config.platforms = [
      {
        name: 'Test Plugin',
        _bridge: {
          username,
          matter: {
            port: 5540,
          },
        },
      },
    ]
    await writeJson(configService.configPath, config)

    // Create Matter storage for this bridge
    const matterPath = resolve(process.env.UIX_STORAGE_PATH, 'matter', deviceId)
    await ensureDir(matterPath)
    await writeJson(resolve(matterPath, 'test.json'), { test: true })

    expect(await pathExists(matterPath)).toBe(true)

    const res = await app.inject({
      method: 'DELETE',
      path: `/server/pairings/${deviceId}/matter`,
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(204)

    // Verify Matter config was removed from config.json
    const updatedConfig = await readJson(configService.configPath)
    expect(updatedConfig.platforms[0]._bridge.matter).toBeUndefined()

    // Verify Matter storage was removed
    expect(await pathExists(matterPath)).toBe(false)
  })

  it('DELETE /server/pairings/:deviceId/matter (should return 404 if Matter config not found)', async () => {
    const config = await readJson(configService.configPath)
    config.platforms = [
      {
        name: 'Test Plugin',
        _bridge: {
          username: '0E:02:9A:9D:44:45',
          // No Matter config
        },
      },
    ]
    await writeJson(configService.configPath, config)

    const res = await app.inject({
      method: 'DELETE',
      path: '/server/pairings/0E029A9D4445/matter',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(404)
  })

  it('DELETE /server/pairings/:deviceId/matter (should handle deviceId with colons)', async () => {
    // Setup: Create config with Matter enabled
    const config = await readJson(configService.configPath)
    const username = '0E:02:9A:9D:44:45'

    config.platforms = [
      {
        name: 'Test Plugin',
        _bridge: {
          username,
          matter: {
            port: 5540,
          },
        },
      },
    ]
    await writeJson(configService.configPath, config)

    // Create Matter storage
    const matterPath = resolve(process.env.UIX_STORAGE_PATH, 'matter', '0E029A9D4445')
    await ensureDir(matterPath)
    await writeJson(resolve(matterPath, 'test.json'), { test: true })

    // Use deviceId WITH colons
    const res = await app.inject({
      method: 'DELETE',
      path: `/server/pairings/${username}/matter`,
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(204)

    // Verify Matter storage was removed
    expect(await pathExists(matterPath)).toBe(false)
  })

  afterAll(async () => {
    await app.close()
  })
})
