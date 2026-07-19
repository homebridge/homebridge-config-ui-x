import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'

import type { HomebridgePlugin } from '../../src/modules/plugins/plugins.interfaces.js'

import * as childProcess from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import process from 'node:process'

import { HttpService } from '@nestjs/axios'
import { ValidationPipe } from '@nestjs/common'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { copy, remove } from 'fs-extra'
import { of } from 'rxjs'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthModule } from '../../src/core/auth/auth.module.js'
import { HomebridgeIpcService } from '../../src/core/homebridge-ipc/homebridge-ipc.service.js'
import { ChildBridgesService } from '../../src/modules/child-bridges/child-bridges.service.js'
import { PluginsModule } from '../../src/modules/plugins/plugins.module.js'
import { PluginsService } from '../../src/modules/plugins/plugins.service.js'

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process')
  return {
    ...actual,
    spawn: vi.fn(actual.spawn),
  }
})

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

    // Isolate plugin discovery to the test plugin path only
    ;(pluginsService as any)._paths = [pluginsPath]
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

  it('sanitises the npm-spawn env so plugin postinstall scripts cannot read secret-shaped keys', () => {
    const sanitized = (pluginsService as any).sanitizeNpmEnv({
      PATH: '/usr/bin',
      HOME: '/home/me',
      LANG: 'en_GB.UTF-8',
      USER: 'pi',
      AWS_ACCESS_KEY_ID: 'AKIA...',
      AWS_SECRET_ACCESS_KEY: 'sekret',
      AZURE_CLIENT_SECRET: 'shh',
      GOOGLE_APPLICATION_CREDENTIALS: '/tmp/key.json',
      GITHUB_TOKEN: 'gh_xxx',
      GH_TOKEN: 'gh_xxx',
      NPM_TOKEN: 'npm_xxx',
      MY_CUSTOM_PASSWORD: 'hunter2',
      DB_PASSWD: 'hunter2',
      SOMETHING_SECRET: 'shh',
      A_PRIVATE_KEY: '-----BEGIN-----',
      HOMEBRIDGE_CONFIG_UI_PORT: '8581',
      UIX_STORAGE_PATH: '/var/lib/homebridge',
      npm_config_loglevel: 'error',
    })

    // Boring system + UI/homebridge wiring must pass through.
    expect(sanitized.PATH).toBe('/usr/bin')
    expect(sanitized.HOME).toBe('/home/me')
    expect(sanitized.LANG).toBe('en_GB.UTF-8')
    expect(sanitized.USER).toBe('pi')
    expect(sanitized.HOMEBRIDGE_CONFIG_UI_PORT).toBe('8581')
    expect(sanitized.UIX_STORAGE_PATH).toBe('/var/lib/homebridge')
    expect(sanitized.npm_config_loglevel).toBe('error')

    // Cloud creds and CI tokens are stripped wholesale.
    expect(sanitized.AWS_ACCESS_KEY_ID).toBeUndefined()
    expect(sanitized.AWS_SECRET_ACCESS_KEY).toBeUndefined()
    expect(sanitized.AZURE_CLIENT_SECRET).toBeUndefined()
    expect(sanitized.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined()
    expect(sanitized.GITHUB_TOKEN).toBeUndefined()
    expect(sanitized.GH_TOKEN).toBeUndefined()
    expect(sanitized.NPM_TOKEN).toBeUndefined()

    // Generic secret-shaped keys are stripped by pattern.
    expect(sanitized.MY_CUSTOM_PASSWORD).toBeUndefined()
    expect(sanitized.DB_PASSWD).toBeUndefined()
    expect(sanitized.SOMETHING_SECRET).toBeUndefined()
    expect(sanitized.A_PRIVATE_KEY).toBeUndefined()
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

  it('GET /plugins/config-schema/:plugin-name (i18n - French)', async () => {
    // Mock the language setting to French
    const originalLang = (pluginsService as any).configService.ui.lang;
    (pluginsService as any).configService.ui.lang = 'fr'

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
    // Verify French translation is loaded
    expect(res.json().schema.properties.name.title).toBe('Nom')
    expect(res.json().schema.properties.name.default).toBe('Exemple de plateforme dynamique')

    // Restore original language
    ;(pluginsService as any).configService.ui.lang = originalLang
  })

  it('GET /plugins/config-schema/:plugin-name (i18n - German)', async () => {
    // Mock the language setting to German
    const originalLang = (pluginsService as any).configService.ui.lang;
    (pluginsService as any).configService.ui.lang = 'de'

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
    // Verify German translation is loaded
    expect(res.json().schema.properties.name.title).toBe('Name')
    expect(res.json().schema.properties.name.default).toBe('Beispiel Dynamische Plattform')

    // Restore original language
    ;(pluginsService as any).configService.ui.lang = originalLang
  })

  it('GET /plugins/config-schema/:plugin-name (i18n - fallback to base for unsupported language)', async () => {
    // Mock the language setting to a language that doesn't have a translation
    const originalLang = (pluginsService as any).configService.ui.lang;
    (pluginsService as any).configService.ui.lang = 'es'

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
    // Verify base English schema is loaded as fallback
    expect(res.json().schema.properties.name.title).toBe('Name')
    expect(res.json().schema.properties.name.default).toBe('Example Dynamic Platform')

    // Restore original language
    ;(pluginsService as any).configService.ui.lang = originalLang
  })

  it('GET /plugins/config-schema/:plugin-name (i18n - English explicitly)', async () => {
    // Mock the language setting to English (should skip i18n directory)
    const originalLang = (pluginsService as any).configService.ui.lang;
    (pluginsService as any).configService.ui.lang = 'en'

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
    // Verify base English schema is loaded (not from i18n directory)
    expect(res.json().schema.properties.name.title).toBe('Name')
    expect(res.json().schema.properties.name.default).toBe('Example Dynamic Platform')

    // Restore original language
    ;(pluginsService as any).configService.ui.lang = originalLang
  })

  it('GET /plugins/config-schema/:plugin-name rejects a dynamicSchemaVersion that escapes storagePath', async () => {
    const { readJson, writeJson, remove } = await import('fs-extra')
    const { resolve: pathResolve } = await import('node:path')

    const baseSchemaPath = pathResolve(pluginsPath, 'homebridge-mock-plugin', 'config.schema.json')
    const baseSchema = await readJson(baseSchemaPath)
    // Traversal climbs from storagePath up into the parent test/ dir.
    const escapeVersion = '1.0/../../escape'
    const escapeTarget = pathResolve(process.env.UIX_STORAGE_PATH!, `.homebridge-mock-plugin-v${escapeVersion}.schema.json`)
    const maliciousSchema = {
      pluginAlias: 'EscapedPlugin',
      pluginType: 'platform',
      schema: { properties: { exfiltrated: { type: 'string', default: 'OWNED' } } },
    }

    try {
      await writeJson(baseSchemaPath, { ...baseSchema, dynamicSchemaVersion: escapeVersion })
      await writeJson(escapeTarget, maliciousSchema)
      // Reset the in-memory plugin cache so the new schema is picked up.
      ;(pluginsService as any).installedPlugins = null

      const res = await app.inject({
        method: 'GET',
        path: '/plugins/config-schema/homebridge-mock-plugin',
        headers: {
          authorization,
        },
      })

      expect(res.statusCode).toBe(200)
      // Must return the original schema, NOT the one parked outside storagePath.
      expect(res.json().pluginAlias).toBe('ExampleHomebridgePlugin')
      expect(res.json().schema.properties.exfiltrated).toBeUndefined()
    } finally {
      await writeJson(baseSchemaPath, baseSchema)
      await remove(escapeTarget).catch(() => undefined)
      ;(pluginsService as any).installedPlugins = null
    }
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

  describe('GET /plugins/:pluginName/editor-context', () => {
    it('returns alias, configSchema, config blocks and childBridges for a plugin with schema', async () => {
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
            name: 'Living Room',
            _bridge: {
              username: '0E:AA:BB:CC:DD:EE',
              port: 45678,
              pin: '111-22-333',
            },
          },
          {
            platform: 'ExampleHomebridgePlugin',
            name: 'Kitchen',
          },
        ],
      }
      await writeFile(process.env.UIX_CONFIG_PATH, JSON.stringify(config, null, 2))

      vi.spyOn(childBridgesService, 'getChildBridges').mockResolvedValue([
        { plugin: 'homebridge-mock-plugin', username: '0E:AA:BB:CC:DD:EE' } as any,
        { plugin: 'homebridge-some-other-plugin', username: '0E:11:22:33:44:55' } as any,
      ])

      const res = await app.inject({
        method: 'GET',
        path: '/plugins/homebridge-mock-plugin/editor-context',
        headers: {
          authorization,
        },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.pluginName).toBe('homebridge-mock-plugin')
      expect(body.alias.pluginAlias).toBe('ExampleHomebridgePlugin')
      expect(body.alias.pluginType).toBe('platform')
      expect(body.configSchema).toBeTruthy()
      expect(body.configSchema.pluginAlias).toBe('ExampleHomebridgePlugin')
      expect(Array.isArray(body.config)).toBe(true)
      expect(body.config).toHaveLength(2)
      expect(body.config.map((b: any) => b.name).sort()).toEqual(['Kitchen', 'Living Room'])
      // childBridges is scoped to the requested plugin only
      expect(body.childBridges).toHaveLength(1)
      expect(body.childBridges[0].plugin).toBe('homebridge-mock-plugin')
    })

    it('returns configSchema: null when the plugin ships without a config.schema.json', async () => {
      vi.spyOn(childBridgesService, 'getChildBridges').mockResolvedValue([])

      const res = await app.inject({
        method: 'GET',
        path: '/plugins/homebridge-mock-plugin-two/editor-context',
        headers: {
          authorization,
        },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.pluginName).toBe('homebridge-mock-plugin-two')
      expect(body.alias.pluginAlias).toBe('HomebridgeMockPluginTwo')
      expect(body.alias.pluginType).toBe('accessory')
      expect(body.configSchema).toBeNull()
      expect(Array.isArray(body.config)).toBe(true)
      expect(Array.isArray(body.childBridges)).toBe(true)
    })

    it('returns 401 without an authorization token', async () => {
      const res = await app.inject({
        method: 'GET',
        path: '/plugins/homebridge-mock-plugin/editor-context',
      })

      expect(res.statusCode).toBe(401)
    })
  })

  describe('GET /plugins?include=config', () => {
    it('attaches saved config blocks to each plugin when include=config is set', async () => {
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
            name: 'Saved Accessory',
          },
        ],
        platforms: [
          {
            platform: 'config',
            name: 'Config',
          },
          {
            platform: 'ExampleHomebridgePlugin',
            name: 'Saved Platform',
          },
        ],
      }
      await writeFile(process.env.UIX_CONFIG_PATH, JSON.stringify(config, null, 2))

      const res = await app.inject({
        method: 'GET',
        path: '/plugins?include=config',
        headers: {
          authorization,
        },
      })

      expect(res.statusCode).toBe(200)
      const plugins: HomebridgePlugin[] = res.json()
      const mockOne = plugins.find(p => p.name === 'homebridge-mock-plugin')
      const mockTwo = plugins.find(p => p.name === 'homebridge-mock-plugin-two')
      expect(mockOne).toBeTruthy()
      expect(mockTwo).toBeTruthy()
      expect(mockOne!.config).toEqual([{ platform: 'ExampleHomebridgePlugin', name: 'Saved Platform' }])
      expect(mockTwo!.config).toEqual([{ accessory: 'HomebridgeMockPluginTwo', name: 'Saved Accessory' }])
    })

    it('attaches an empty config array when the plugin has no saved blocks', async () => {
      // config.json mock has no blocks for homebridge-mock-plugin or -two
      await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH)

      const res = await app.inject({
        method: 'GET',
        path: '/plugins?include=config',
        headers: {
          authorization,
        },
      })

      expect(res.statusCode).toBe(200)
      const plugins: HomebridgePlugin[] = res.json()
      for (const plugin of plugins) {
        expect(Array.isArray(plugin.config)).toBe(true)
      }
    })

    it('default GET /plugins still omits the config field', async () => {
      const res = await app.inject({
        method: 'GET',
        path: '/plugins',
        headers: {
          authorization,
        },
      })

      expect(res.statusCode).toBe(200)
      const plugins: HomebridgePlugin[] = res.json()
      for (const plugin of plugins) {
        expect(plugin).not.toHaveProperty('config')
      }
    })

    it('ignores unknown include values without erroring', async () => {
      const res = await app.inject({
        method: 'GET',
        path: '/plugins?include=bogus',
        headers: {
          authorization,
        },
      })

      expect(res.statusCode).toBe(200)
      const plugins: HomebridgePlugin[] = res.json()
      for (const plugin of plugins) {
        expect(plugin).not.toHaveProperty('config')
      }
    })
  })

  it('POST /plugins/update/:pluginName (plugin with specific version)', async () => {
    const managePluginSpy = vi.spyOn(pluginsService as any, 'managePlugin').mockResolvedValue(true)

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

    // Wait for the setImmediate callback to complete
    await new Promise(resolve => setTimeout(resolve, 200))

    managePluginSpy.mockRestore()
  })

  it('POST /plugins/update/:pluginName (plugin without version - latest)', async () => {
    const managePluginSpy = vi.spyOn(pluginsService as any, 'managePlugin').mockResolvedValue(true)

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

    // Wait for the setImmediate callback to complete
    await new Promise(resolve => setTimeout(resolve, 200))

    managePluginSpy.mockRestore()
  })

  it('POST /plugins/update/:pluginName (homebridge)', async () => {
    const updateHomebridgeSpy = vi.spyOn(pluginsService as any, 'updateHomebridgePackage').mockResolvedValue(true)
    const restartHomebridgeSpy = vi.spyOn(homebridgeIpcService, 'restartHomebridge').mockImplementation(() => {})

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

    // Wait for the setImmediate callback to complete
    await new Promise(resolve => setTimeout(resolve, 200))

    updateHomebridgeSpy.mockRestore()
    restartHomebridgeSpy.mockRestore()
  })

  it('POST /plugins/update/:pluginName (homebridge-config-ui-x)', async () => {
    const managePluginSpy = vi.spyOn(pluginsService as any, 'managePlugin').mockResolvedValue(true)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

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

    // Wait for the setImmediate callback to complete
    await new Promise(resolve => setTimeout(resolve, 200))

    managePluginSpy.mockRestore()
    exitSpy.mockRestore()
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

  describe('module discovery with broken directories', () => {
    it('should skip modules without a package.json', async () => {
      // Create a broken module directory (no package.json) alongside valid plugins
      const brokenModulePath = join(pluginsPath, 'homebridge-broken-plugin')
      await mkdir(brokenModulePath, { recursive: true })
      // Only add a node_modules subfolder, no package.json — simulates a partial install
      await mkdir(join(brokenModulePath, 'node_modules'), { recursive: true })

      // Clear the installed plugins cache so discovery runs fresh
      pluginsService.clearInstalledPluginsCache()

      const res = await app.inject({
        method: 'GET',
        path: '/plugins',
        headers: {
          authorization,
        },
      })

      expect(res.statusCode).toBe(200)

      const plugins: HomebridgePlugin[] = res.json()
      // The broken module should not appear in results
      expect(plugins.find(x => x.name === 'homebridge-broken-plugin')).toBeUndefined()
      // Valid plugins should still be found
      expect(plugins.find(x => x.name === 'homebridge-mock-plugin')).toBeTruthy()

      // Cleanup
      await remove(brokenModulePath)
    })

    it('should skip scoped modules without a package.json', async () => {
      // Create a broken scoped module directory
      const scopePath = join(pluginsPath, '@test-scope')
      const brokenScopedModulePath = join(scopePath, 'homebridge-broken-scoped')
      await mkdir(brokenScopedModulePath, { recursive: true })
      // No package.json inside

      // Clear the installed plugins cache so discovery runs fresh
      pluginsService.clearInstalledPluginsCache()

      const res = await app.inject({
        method: 'GET',
        path: '/plugins',
        headers: {
          authorization,
        },
      })

      expect(res.statusCode).toBe(200)

      const plugins: HomebridgePlugin[] = res.json()
      // The broken scoped module should not appear in results
      expect(plugins.find(x => x.name === '@test-scope/homebridge-broken-scoped')).toBeUndefined()
      // Valid plugins should still be found
      expect(plugins.find(x => x.name === 'homebridge-mock-plugin')).toBeTruthy()

      // Cleanup
      await remove(scopePath)
    })
  })

  describe('cleanNpmCache', () => {
    it('invokes spawn in argv form so shell metacharacters in the npm path are not interpreted', async () => {
      const fakeChild = new EventEmitter()
      const spawnMock = vi.mocked(childProcess.spawn)
      spawnMock.mockClear()
      spawnMock.mockImplementationOnce(() => {
        setImmediate(() => fakeChild.emit('exit', 0))
        return fakeChild as any
      })

      await (pluginsService as any).cleanNpmCache()

      expect(spawnMock).toHaveBeenCalledOnce()
      const call = spawnMock.mock.calls[0]
      expect(typeof call[0]).toBe('string')
      expect(Array.isArray(call[1])).toBe(true)
      expect((call[2] as any)?.shell).not.toBe(true)
    })
  })

  describe('getAllowedInstallScripts (#2909)', () => {
    const call = (name: string, version: string) =>
      (pluginsService as any).getAllowedInstallScripts(name, version) as Promise<string[]>

    beforeEach(() => {
      // Prime the cached npm major version so the tests never shell out.
      ;(pluginsService as any).npmMajorVersion = 12
    })

    it('returns an empty list on npm older than 12 without hitting the registry', async () => {
      ;(pluginsService as any).npmMajorVersion = 10
      const getSpy = vi.spyOn(httpService, 'get')

      await expect(call('homebridge-mock-plugin', '1.0.0')).resolves.toEqual([])
      expect(getSpy).not.toHaveBeenCalled()
      getSpy.mockRestore()
    })

    it('allows the plugin itself plus map-form allowScripts entries, keys verbatim', async () => {
      const getSpy = vi.spyOn(httpService, 'get').mockReturnValue(of({
        data: {
          versions: {
            '1.0.0': {
              allowScripts: {
                '@stoprocent/noble@2.3.4': true,
                'ffmpeg-for-homebridge': true,
                'blocked-package': false,
              },
            },
          },
        },
      }) as any)

      await expect(call('homebridge-mock-plugin', '1.0.0')).resolves.toEqual([
        'homebridge-mock-plugin',
        '@stoprocent/noble@2.3.4',
        'ffmpeg-for-homebridge',
      ])
      getSpy.mockRestore()
    })

    it('allows array-form allowScripts entries', async () => {
      const getSpy = vi.spyOn(httpService, 'get').mockReturnValue(of({
        data: {
          versions: {
            '2.0.0': { allowScripts: ['ffmpeg-for-homebridge'] },
          },
        },
      }) as any)

      await expect(call('homebridge-mock-plugin', '2.0.0')).resolves.toEqual([
        'homebridge-mock-plugin',
        'ffmpeg-for-homebridge',
      ])
      getSpy.mockRestore()
    })

    it('still allows the plugin itself when it declares no allowScripts', async () => {
      const getSpy = vi.spyOn(httpService, 'get').mockReturnValue(of({
        data: { versions: { '1.0.0': {} } },
      }) as any)

      await expect(call('homebridge-mock-plugin', '1.0.0')).resolves.toEqual(['homebridge-mock-plugin'])
      getSpy.mockRestore()
    })

    it('still allows the plugin itself when the registry lookup fails', async () => {
      const getSpy = vi.spyOn(httpService, 'get').mockImplementation(() => {
        throw new Error('registry unreachable')
      })

      await expect(call('homebridge-mock-plugin', '1.0.0')).resolves.toEqual(['homebridge-mock-plugin'])
      getSpy.mockRestore()
    })
  })

  afterAll(async () => {
    await app.close()
  })
})
