import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'

import type { HomebridgePlugin } from '../../src/modules/plugins/plugins.interfaces.js'

import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

import { HttpService } from '@nestjs/axios'
import { ValidationPipe } from '@nestjs/common'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { copy, remove } from 'fs-extra'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthModule } from '../../src/core/auth/auth.module.js'
import { HomebridgeIpcService } from '../../src/core/homebridge-ipc/homebridge-ipc.service.js'
import { ChildBridgesService } from '../../src/modules/child-bridges/child-bridges.service.js'
import { PluginsModule } from '../../src/modules/plugins/plugins.module.js'
import { PluginsService } from '../../src/modules/plugins/plugins.service.js'

describe('PluginController (e2e)', () => {
  let app: NestFastifyApplication
  let httpService: HttpService
  let pluginsService: PluginsService
  let homebridgeIpcService: HomebridgeIpcService
  let childBridgesService: ChildBridgesService

  let authFilePath: string
  let secretsFilePath: string
  let pluginsPath: string
  let authorization: string

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = resolve(__dirname, '../../')
    process.env.UIX_STORAGE_PATH = resolve(__dirname, '../', '.homebridge')
    process.env.UIX_CONFIG_PATH = resolve(process.env.UIX_STORAGE_PATH, 'config.json')
    process.env.UIX_CUSTOM_PLUGIN_PATH = resolve(process.env.UIX_STORAGE_PATH, 'plugins/node_modules')

    authFilePath = resolve(process.env.UIX_STORAGE_PATH, 'auth.json')
    secretsFilePath = resolve(process.env.UIX_STORAGE_PATH, '.uix-secrets')
    pluginsPath = process.env.UIX_CUSTOM_PLUGIN_PATH

    // Setup test config
    await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH)

    // Setup test auth file
    await copy(resolve(__dirname, '../mocks', 'auth.json'), authFilePath)
    await copy(resolve(__dirname, '../mocks', '.uix-secrets'), secretsFilePath)

    await remove(pluginsPath)
    await copy(resolve(__dirname, '../mocks', 'plugins'), pluginsPath)

    // create httpService instance
    httpService = new HttpService()

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [PluginsModule, AuthModule],
    }).overrideProvider(HttpService).useValue(httpService).compile()

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter())

    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      skipMissingProperties: true,
    }))

    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    // Get service instances for testing
    pluginsService = app.get<PluginsService>(PluginsService)
    homebridgeIpcService = app.get<HomebridgeIpcService>(HomebridgeIpcService)
    childBridgesService = app.get<ChildBridgesService>(ChildBridgesService)
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

  it('GET /plugins', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/plugins',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().length).toBeGreaterThan(0)

    const mockPlugin: HomebridgePlugin = res.json().find(x => x.name === 'homebridge-mock-plugin')

    expect(mockPlugin).toBeTruthy()
    expect(mockPlugin.settingsSchema).toBe(true)
    expect(mockPlugin.private).toBe(true)
    expect(mockPlugin.publicPackage).toBe(false)
  })

  it('GET /plugins/search/:query (keyword)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/plugins/search/google',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().length).toBeGreaterThan(0)
    expect(res.json().find(x => x.name === 'homebridge-gsh')).toBeTruthy()
    expect(res.json()[0]).toHaveProperty('lastUpdated')
    expect(res.json()[0]).toHaveProperty('private')
  })

  it('GET /plugins/search/:query (keyword) - #2290', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/plugins/search/alexa',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().length).toBeGreaterThan(0)
    expect(res.json().find(x => x.name === 'homebridge-alexa-smarthome')).toBeTruthy()
    expect(res.json()[0]).toHaveProperty('lastUpdated')
    expect(res.json()[0].private).toBe(false)
  })

  it('GET /plugins/search/:query (exact plugin name)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/plugins/search/homebridge-daikin-esp8266',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(1)
    expect(res.json().find(x => x.name === 'homebridge-daikin-esp8266')).toBeTruthy()
    expect(res.json()[0]).toHaveProperty('lastUpdated')
    expect(res.json()[0]).toHaveProperty('private')
    expect(res.json()[0].private).toBe(false)
  })

  it('GET /plugins/search/:query (exact plugin name - @scoped)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: `/plugins/search/${encodeURIComponent('@oznu/homebridge-esp8266-garage-door')}`,
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(1)
    expect(res.json().find(x => x.name === '@oznu/homebridge-esp8266-garage-door')).toBeTruthy()
    expect(res.json()[0]).toHaveProperty('lastUpdated')
    expect(res.json()[0]).toHaveProperty('private')
    expect(res.json()[0].private).toBe(false)
  })

  it('GET /plugins/search/:query (blacklisted - exact plugin name)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/plugins/search/homebridge-config-ui-rdp',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().filter(x => x.name === 'homebridge-config-ui-rdp')).toHaveLength(0)
  })

  it('GET /plugins/search/:query (blacklisted - search query)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: `/plugins/search/${encodeURIComponent('ui')}`,
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().filter(x => x.name === 'homebridge-config-ui-rdp')).toHaveLength(0)
  })

  it('GET /plugins/lookup/:pluginName (non-scoped)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/plugins/lookup/homebridge-daikin-esp8266',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().name).toBe('homebridge-daikin-esp8266')
    expect(res.json()).toHaveProperty('lastUpdated')
    expect(res.json()).toHaveProperty('private')
    expect(res.json().private).toBe(false)
  })

  it('GET /plugins/lookup/:pluginName (@scoped)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: `/plugins/lookup/${encodeURIComponent('@oznu/homebridge-esp8266-garage-door')}`,
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().name).toBe('@oznu/homebridge-esp8266-garage-door')
    expect(res.json()).toHaveProperty('lastUpdated')
    expect(res.json()).toHaveProperty('private')
    expect(res.json().private).toBe(false)
  })

  it('GET /plugins/lookup/:pluginName (not a homebridge plugin)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/plugins/lookup/npm',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().message).toBe('Invalid plugin name.')
  })

  it('GET /plugins/lookup/:pluginName/versions (non-scoped)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/plugins/lookup/homebridge-daikin-esp8266/versions',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveProperty('tags')
    expect(res.json()).toHaveProperty('versions')
  })

  it('GET /plugins/lookup/:pluginName/versions (@scoped)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: `/plugins/lookup/${encodeURIComponent('@oznu/homebridge-esp8266-garage-door')}/versions`,
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveProperty('tags')
    expect(res.json()).toHaveProperty('versions')
  })

  it('GET /plugins/config-schema/:plugin-name', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/plugins/config-schema/homebridge-mock-plugin',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().pluginAlias).toBe('ExampleHomebridgePlugin')
    expect(res.json().pluginType).toBe('platform')
  })

  it('GET /plugins/changelog/:plugin-name', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/plugins/changelog/homebridge-mock-plugin',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveProperty('changelog')
  })

  it('GET /plugins/changelog/:plugin-name (changelog missing)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/plugins/changelog/homebridge-mock-plugin-two',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(404)
  })

  it('GET /plugins/alias/:plugin-name (with config.schema.json)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/plugins/alias/homebridge-mock-plugin',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().pluginAlias).toBe('ExampleHomebridgePlugin')
    expect(res.json().pluginType).toBe('platform')
  })

  it('GET /plugins/alias/:plugin-name (without config.schema.json)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/plugins/alias/homebridge-mock-plugin-two',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().pluginAlias).toBe('HomebridgeMockPluginTwo')
    expect(res.json().pluginType).toBe('accessory')
  })

  it('POST /plugins/update/:pluginName (plugin with specific version)', async () => {
    const res = await app.inject({
      method: 'POST',
      path: '/plugins/update/homebridge-mock-plugin?version=1.0.1',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().ok).toBe(true)
    expect(res.json().name).toBe('homebridge-mock-plugin')
    expect(res.json().version).toBe('1.0.1')
  })

  it('POST /plugins/update/:pluginName (plugin without version - latest)', async () => {
    const res = await app.inject({
      method: 'POST',
      path: '/plugins/update/homebridge-mock-plugin',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().ok).toBe(true)
    expect(res.json().name).toBe('homebridge-mock-plugin')
    expect(res.json()).toHaveProperty('version')
    // Latest version should be resolved from package
  })

  it('POST /plugins/update/:pluginName (homebridge)', async () => {
    const res = await app.inject({
      method: 'POST',
      path: '/plugins/update/homebridge',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().ok).toBe(true)
    expect(res.json().name).toBe('homebridge')
    expect(res.json()).toHaveProperty('version')
  })

  it('POST /plugins/update/:pluginName (homebridge-config-ui-x)', async () => {
    const res = await app.inject({
      method: 'POST',
      path: '/plugins/update/homebridge-config-ui-x?version=5.8.0',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().ok).toBe(true)
    expect(res.json().name).toBe('homebridge-config-ui-x')
    expect(res.json().version).toBe('5.8.0')
  })

  it('POST /plugins/update/:pluginName (not installed)', async () => {
    const res = await app.inject({
      method: 'POST',
      path: '/plugins/update/homebridge-not-installed',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(404)
    expect(res.json()).toHaveProperty('message')
  })

  it('POST /plugins/update/:pluginName (invalid plugin name)', async () => {
    const res = await app.inject({
      method: 'POST',
      path: '/plugins/update/invalid-plugin-name',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json()).toHaveProperty('message')
  })

  it('POST /plugins/update/:pluginName (@scoped plugin)', async () => {
    const res = await app.inject({
      method: 'POST',
      path: '/plugins/update/@oznu/homebridge-esp8266-garage-door?version=1.0.0',
      headers: {
        authorization,
      },
    })

    // This should return 404 because the plugin is not installed in the test environment
    // But it validates that scoped packages are handled correctly
    expect([404, 201]).toContain(res.statusCode)
  })

  it('POST /plugins/update/:pluginName (requires authentication)', async () => {
    const res = await app.inject({
      method: 'POST',
      path: '/plugins/update/homebridge-mock-plugin?version=1.0.1',
    })

    expect(res.statusCode).toBe(401)
  })

  describe('getPluginChildBridgeUsernames', () => {
    it('should return empty array for plugin not in child bridge', async () => {
      const config = {
        bridge: {
          name: 'Homebridge',
          username: '0E:1A:2B:3C:4D:5E',
          port: 51826,
          pin: '123-45-678',
        },
        platforms: [
          {
            platform: 'config',
            name: 'Config',
          },
          {
            platform: 'ExampleHomebridgePlugin',
            name: 'Test',
          },
        ],
      }
      await writeFile(process.env.UIX_CONFIG_PATH, JSON.stringify(config, null, 2))

      const result = await pluginsService.getPluginChildBridgeUsernames('homebridge-mock-plugin')

      expect(result).toEqual([])
    })

    it('should return username for plugin in a single child bridge', async () => {
      const config = {
        bridge: {
          name: 'Homebridge',
          username: '0E:1A:2B:3C:4D:5E',
          port: 51826,
          pin: '123-45-678',
        },
        platforms: [
          {
            platform: 'config',
            name: 'Config',
          },
          {
            platform: 'ExampleHomebridgePlugin',
            name: 'Test',
            _bridge: {
              username: '0E:AA:BB:CC:DD:EE',
              port: 45678,
              pin: '111-22-333',
            },
          },
        ],
      }
      await writeFile(process.env.UIX_CONFIG_PATH, JSON.stringify(config, null, 2))

      const result = await pluginsService.getPluginChildBridgeUsernames('homebridge-mock-plugin')

      expect(result).toHaveLength(1)
      expect(result[0]).toBe('0E:AA:BB:CC:DD:EE')
    })

    it('should return multiple usernames for plugin in multiple child bridges', async () => {
      const config = {
        bridge: {
          name: 'Homebridge',
          username: '0E:1A:2B:3C:4D:5E',
          port: 51826,
          pin: '123-45-678',
        },
        platforms: [
          {
            platform: 'config',
            name: 'Config',
          },
          {
            platform: 'ExampleHomebridgePlugin',
            name: 'Test 1',
            _bridge: {
              username: '0E:AA:BB:CC:DD:EE',
              port: 45678,
              pin: '111-22-333',
            },
          },
          {
            platform: 'ExampleHomebridgePlugin',
            name: 'Test 2',
            _bridge: {
              username: '0E:FF:FF:FF:FF:FF',
              port: 45679,
              pin: '222-33-444',
            },
          },
        ],
      }
      await writeFile(process.env.UIX_CONFIG_PATH, JSON.stringify(config, null, 2))

      const result = await pluginsService.getPluginChildBridgeUsernames('homebridge-mock-plugin')

      expect(result).toHaveLength(2)
      expect(result).toContain('0E:AA:BB:CC:DD:EE')
      expect(result).toContain('0E:FF:FF:FF:FF:FF')
    })

    it('should return single username when multiple blocks share same child bridge', async () => {
      const config = {
        bridge: {
          name: 'Homebridge',
          username: '0E:1A:2B:3C:4D:5E',
          port: 51826,
          pin: '123-45-678',
        },
        accessories: [
          {
            accessory: 'HomebridgeMockPluginTwo',
            name: 'Test 1',
            _bridge: {
              username: '0E:AA:BB:CC:DD:EE',
            },
          },
          {
            accessory: 'HomebridgeMockPluginTwo',
            name: 'Test 2',
            _bridge: {
              username: '0E:AA:BB:CC:DD:EE',
            },
          },
        ],
      }
      await writeFile(process.env.UIX_CONFIG_PATH, JSON.stringify(config, null, 2))

      const result = await pluginsService.getPluginChildBridgeUsernames('homebridge-mock-plugin-two')

      expect(result).toEqual(['0E:AA:BB:CC:DD:EE'])
    })

    it('should handle mixed config blocks (some with _bridge, some without)', async () => {
      const config = {
        bridge: {
          name: 'Homebridge',
          username: '0E:1A:2B:3C:4D:5E',
          port: 51826,
          pin: '123-45-678',
        },
        platforms: [
          {
            platform: 'config',
            name: 'Config',
          },
          {
            platform: 'ExampleHomebridgePlugin',
            name: 'In Child Bridge',
            _bridge: {
              username: '0E:AA:BB:CC:DD:EE',
              port: 45678,
              pin: '111-22-333',
            },
          },
          {
            platform: 'ExampleHomebridgePlugin',
            name: 'In Main Bridge',
          },
        ],
      }
      await writeFile(process.env.UIX_CONFIG_PATH, JSON.stringify(config, null, 2))

      const result = await pluginsService.getPluginChildBridgeUsernames('homebridge-mock-plugin')

      // Should only return child bridge username, not count the main bridge config
      expect(result).toEqual(['0E:AA:BB:CC:DD:EE'])
    })
  })

  describe('POST /plugins/update/:pluginName (restart behavior)', () => {
    beforeEach(async () => {
      // Reset the config to a known state before each test
      await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH)
    })

    it('should restart child bridge when plugin is in child bridge', async () => {
      // Setup config with plugin in child bridge
      const config = {
        bridge: {
          name: 'Homebridge',
          username: '0E:1A:2B:3C:4D:5E',
          port: 51826,
          pin: '123-45-678',
        },
        platforms: [
          {
            platform: 'config',
            name: 'Config',
          },
          {
            platform: 'ExampleHomebridgePlugin',
            name: 'Test',
            _bridge: {
              username: '0E:AA:BB:CC:DD:EE',
              port: 45678,
              pin: '111-22-333',
            },
          },
        ],
      }
      await writeFile(process.env.UIX_CONFIG_PATH, JSON.stringify(config, null, 2))

      // Mock the update and restart methods BEFORE making the request
      const managePluginSpy = vi.spyOn(pluginsService as any, 'managePlugin').mockResolvedValue(true)
      const getPluginAliasSpy = vi.spyOn(pluginsService, 'getPluginAlias').mockResolvedValue({
        pluginAlias: 'ExampleHomebridgePlugin',
        pluginType: 'platform',
      })
      const restartChildBridgeSpy = vi.spyOn(childBridgesService, 'restartChildBridge').mockReturnValue({ ok: true })
      const restartHomebridgeSpy = vi.spyOn(homebridgeIpcService, 'restartHomebridge').mockImplementation(() => {})

      const res = await app.inject({
        method: 'POST',
        path: '/plugins/update/homebridge-mock-plugin?version=1.0.0',
        headers: {
          authorization,
        },
      })

      expect(res.statusCode).toBe(201)
      expect(res.json().ok).toBe(true)

      // Wait for async operations to complete (setImmediate + file operations)
      await new Promise(resolve => setTimeout(resolve, 200))

      // Verify child bridge restart was called, not main homebridge restart
      expect(restartChildBridgeSpy).toHaveBeenCalledWith('0E:AA:BB:CC:DD:EE')
      expect(restartHomebridgeSpy).not.toHaveBeenCalled()

      managePluginSpy.mockRestore()
      getPluginAliasSpy.mockRestore()
      restartChildBridgeSpy.mockRestore()
      restartHomebridgeSpy.mockRestore()
    })

    it('should restart multiple child bridges when plugin is in multiple child bridges', async () => {
      const config = {
        bridge: {
          name: 'Homebridge',
          username: '0E:1A:2B:3C:4D:5E',
          port: 51826,
          pin: '123-45-678',
        },
        platforms: [
          {
            platform: 'config',
            name: 'Config',
          },
          {
            platform: 'ExampleHomebridgePlugin',
            name: 'Test 1',
            _bridge: {
              username: '0E:AA:BB:CC:DD:EE',
              port: 45678,
              pin: '111-22-333',
            },
          },
          {
            platform: 'ExampleHomebridgePlugin',
            name: 'Test 2',
            _bridge: {
              username: '0E:FF:FF:FF:FF:FF',
              port: 45679,
              pin: '222-33-444',
            },
          },
        ],
      }
      await writeFile(process.env.UIX_CONFIG_PATH, JSON.stringify(config, null, 2))

      const managePluginSpy = vi.spyOn(pluginsService as any, 'managePlugin').mockResolvedValue(true)
      const getPluginAliasSpy = vi.spyOn(pluginsService, 'getPluginAlias').mockResolvedValue({
        pluginAlias: 'ExampleHomebridgePlugin',
        pluginType: 'platform',
      })
      const restartChildBridgeSpy = vi.spyOn(childBridgesService, 'restartChildBridge').mockReturnValue({ ok: true })
      const restartHomebridgeSpy = vi.spyOn(homebridgeIpcService, 'restartHomebridge').mockImplementation(() => {})

      const res = await app.inject({
        method: 'POST',
        path: '/plugins/update/homebridge-mock-plugin?version=1.0.0',
        headers: {
          authorization,
        },
      })

      expect(res.statusCode).toBe(201)
      await new Promise(resolve => setTimeout(resolve, 200))

      // Both child bridges should be restarted
      expect(restartChildBridgeSpy).toHaveBeenCalledTimes(2)
      expect(restartChildBridgeSpy).toHaveBeenCalledWith('0E:AA:BB:CC:DD:EE')
      expect(restartChildBridgeSpy).toHaveBeenCalledWith('0E:FF:FF:FF:FF:FF')
      expect(restartHomebridgeSpy).not.toHaveBeenCalled()

      managePluginSpy.mockRestore()
      getPluginAliasSpy.mockRestore()
      restartChildBridgeSpy.mockRestore()
      restartHomebridgeSpy.mockRestore()
    })

    it('should restart homebridge when plugin is not in child bridge', async () => {
      const config = {
        bridge: {
          name: 'Homebridge',
          username: '0E:1A:2B:3C:4D:5E',
          port: 51826,
          pin: '123-45-678',
        },
        platforms: [
          {
            platform: 'config',
            name: 'Config',
          },
          {
            platform: 'ExampleHomebridgePlugin',
            name: 'Test',
            // No _bridge property - running in main bridge
          },
        ],
      }
      await writeFile(process.env.UIX_CONFIG_PATH, JSON.stringify(config, null, 2))

      const managePluginSpy = vi.spyOn(pluginsService as any, 'managePlugin').mockResolvedValue(true)
      const restartChildBridgeSpy = vi.spyOn(childBridgesService, 'restartChildBridge').mockReturnValue({ ok: true })
      const restartHomebridgeSpy = vi.spyOn(homebridgeIpcService, 'restartHomebridge').mockImplementation(() => {})

      const res = await app.inject({
        method: 'POST',
        path: '/plugins/update/homebridge-mock-plugin?version=1.0.0',
        headers: {
          authorization,
        },
      })

      expect(res.statusCode).toBe(201)
      await new Promise(resolve => setTimeout(resolve, 200))

      // Main homebridge should be restarted, not child bridges
      expect(restartHomebridgeSpy).toHaveBeenCalled()
      expect(restartChildBridgeSpy).not.toHaveBeenCalled()

      managePluginSpy.mockRestore()
      restartChildBridgeSpy.mockRestore()
      restartHomebridgeSpy.mockRestore()
    })

    it('should restart homebridge when updating homebridge itself', async () => {
      const updateHomebridgeSpy = vi.spyOn(pluginsService as any, 'updateHomebridgePackage').mockResolvedValue(true)
      const restartChildBridgeSpy = vi.spyOn(childBridgesService, 'restartChildBridge').mockReturnValue({ ok: true })
      const restartHomebridgeSpy = vi.spyOn(homebridgeIpcService, 'restartHomebridge').mockImplementation(() => {})

      const res = await app.inject({
        method: 'POST',
        path: '/plugins/update/homebridge?version=1.8.0',
        headers: {
          authorization,
        },
      })

      expect(res.statusCode).toBe(201)
      await new Promise(resolve => setTimeout(resolve, 200))

      // Homebridge quick restart should be called
      expect(restartHomebridgeSpy).toHaveBeenCalled()
      expect(restartChildBridgeSpy).not.toHaveBeenCalled()

      updateHomebridgeSpy.mockRestore()
      restartChildBridgeSpy.mockRestore()
      restartHomebridgeSpy.mockRestore()
    })

    it('should schedule full restart when updating homebridge-config-ui-x', async () => {
      const managePluginSpy = vi.spyOn(pluginsService as any, 'managePlugin').mockResolvedValue(true)
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

      const res = await app.inject({
        method: 'POST',
        path: '/plugins/update/homebridge-config-ui-x?version=5.8.0',
        headers: {
          authorization,
        },
      })

      expect(res.statusCode).toBe(201)
      await new Promise(resolve => setTimeout(resolve, 200))

      // setTimeout should be called to schedule the restart (with 5000ms delay)
      const expectedDelayMs = 5000 // PluginsService.UI_RESTART_DELAY_MS
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), expectedDelayMs)

      managePluginSpy.mockRestore()
      exitSpy.mockRestore()
      setTimeoutSpy.mockRestore()
    })
  })

  afterAll(async () => {
    await app.close()
  })
})
