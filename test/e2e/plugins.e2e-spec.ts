import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'

import type { HomebridgePlugin } from '../../src/modules/plugins/plugins.interfaces.js'

import * as childProcess from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdir, symlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import process from 'node:process'

import { HttpService } from '@nestjs/axios'
import { ValidationPipe } from '@nestjs/common'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { copy, readJson, remove } from 'fs-extra'
import { of } from 'rxjs'
import { gt as semverGt } from 'semver'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthModule } from '../../src/core/auth/auth.module.js'
import { ConfigService } from '../../src/core/config/config.service.js'
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

  // ⚠️ Two tests below POST /plugins/update/homebridge-config-ui-x, which is
  // the path that schedules the UI's own restart - a real process.exit(0) five
  // seconds later. The test that arms it passes and moves on, so the exit lands
  // mid-suite and kills the whole vitest worker, blamed on whichever unrelated
  // test happened to be running. Held for the lifetime of this file rather than
  // per-test, because the fuse outlives the test that lit it.
  let exitSpy: ReturnType<typeof vi.spyOn>

  beforeAll(async () => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
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

    // ⚠️ Kill the fuse before releasing the stub - see the note on the other
    // update test. 5000ms timer, 200ms wait: restoring process.exit here left a
    // live timer that fired during a later test and killed the worker.
    pluginsService.onModuleDestroy()
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

      // ⚠️ Kill the fuse before releasing the stub. The restart is armed on a
      // 5000ms timer but this test only waits 200ms, so restoring process.exit
      // here used to leave a live timer that fired 4.8s later - during whatever
      // test was running by then - and took the whole worker down with it.
      pluginsService.onModuleDestroy()
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

  describe('supportsMatter', () => {
    const call = (keywords?: string[]) => (pluginsService as any).supportsMatter(keywords) as boolean

    it('is true when the plugin declares the supports-matter keyword', () => {
      expect(call(['homebridge-plugin', 'supports-matter'])).toBe(true)
    })

    it('is false when the keyword is absent', () => {
      expect(call(['homebridge-plugin', 'matter'])).toBe(false)
    })

    it('is false when there are no keywords at all', () => {
      expect(call([])).toBe(false)
      expect(call(undefined)).toBe(false)
    })

    it('ignores keyword casing', () => {
      expect(call(['supports-matter'])).toBe(true)
    })

    it('does not match a keyword that merely contains the term', () => {
      expect(call(['not-supports-matter-really'])).toBe(false)
    })
  })

  describe('supportsHap', () => {
    const call = (keywords?: string[]) => (pluginsService as any).supportsHap(keywords) as boolean

    it('is true when the plugin declares the supports-hap keyword', () => {
      expect(call(['homebridge-plugin', 'supports-hap'])).toBe(true)
    })

    it('is false when the keyword is absent', () => {
      expect(call(['homebridge-plugin', 'hap'])).toBe(false)
    })

    it('is false when there are no keywords at all', () => {
      expect(call([])).toBe(false)
      expect(call(undefined)).toBe(false)
    })

    it('ignores keyword casing', () => {
      expect(call(['Supports-HAP'])).toBe(true)
    })

    it('does not match a keyword that merely contains the term', () => {
      expect(call(['not-supports-hap-really'])).toBe(false)
    })

    // The convention (#3975): declaring either transport keyword makes the
    // declaration complete, so supports-matter without supports-hap marks a
    // matter-only plugin. Neither keyword = legacy = treated as HAP.
    it('marks a plugin as matter-only when it declares supports-matter without supports-hap', () => {
      const matterOnly = (keywords: string[]) =>
        (pluginsService as any).supportsMatter(keywords) && !(pluginsService as any).supportsHap(keywords)
      expect(matterOnly(['homebridge-plugin', 'supports-matter'])).toBe(true)
      expect(matterOnly(['homebridge-plugin', 'supports-matter', 'supports-hap'])).toBe(false)
      expect(matterOnly(['homebridge-plugin'])).toBe(false)
    })
  })

  describe('checkForBetaUpdates', () => {
    // Model the caller: it sets latestVersion/updateAvailable from the stable
    // release before delegating to the beta check.
    const check = async (opts: {
      installed: string
      stable: string
      betaTag?: string
      preferBetas: boolean
    }) => {
      const plugin: any = {
        name: 'homebridge-mock-plugin',
        installedVersion: opts.installed,
        latestVersion: opts.stable,
        updateAvailable: semverGt(opts.stable, opts.installed),
        updateTag: null,
      }

      const versionsSpy = vi.spyOn(pluginsService, 'getAvailablePluginVersions').mockResolvedValue({
        tags: opts.betaTag ? { latest: opts.stable, beta: opts.betaTag } : { latest: opts.stable },
        versions: {},
      } as any)

      try {
        await (pluginsService as any).checkForBetaUpdates(plugin, plugin.name, opts.preferBetas)
      } finally {
        versionsSpy.mockRestore()
      }

      return plugin
    }

    it('offers a newer beta even when a stable update is also available', async () => {
      // Regression: the beta preference used to be skipped entirely whenever a
      // stable update existed, so beta users were offered the stable version.
      const plugin = await check({
        installed: '11.29.0',
        stable: '11.29.3',
        betaTag: '11.30.0-beta.2',
        preferBetas: true,
      })

      expect(plugin.latestVersion).toBe('11.30.0-beta.2')
      expect(plugin.updateAvailable).toBe(true)
      expect(plugin.updateTag).toBe('beta')
    })

    it('keeps the stable when it has overtaken the beta line', async () => {
      // A prerelease sorts below its own release, so a beta user should not be
      // sent backwards from 11.30.0 to 11.30.0-beta.2.
      const plugin = await check({
        installed: '11.30.0-beta.1',
        stable: '11.30.0',
        betaTag: '11.30.0-beta.2',
        preferBetas: true,
      })

      expect(plugin.latestVersion).toBe('11.30.0')
      expect(plugin.updateTag).toBeNull()
    })

    it('offers a beta to a user on the current stable', async () => {
      const plugin = await check({
        installed: '11.29.3',
        stable: '11.29.3',
        betaTag: '11.30.0-beta.2',
        preferBetas: true,
      })

      expect(plugin.latestVersion).toBe('11.30.0-beta.2')
      expect(plugin.updateTag).toBe('beta')
    })

    it('does not offer betas when the preference is off', async () => {
      const plugin = await check({
        installed: '11.29.0',
        stable: '11.29.3',
        betaTag: '11.30.0-beta.2',
        preferBetas: false,
      })

      expect(plugin.latestVersion).toBe('11.29.3')
      expect(plugin.updateTag).toBeNull()
    })

    it('reports no update when already on the newest beta', async () => {
      const plugin = await check({
        installed: '11.30.0-beta.2',
        stable: '11.29.3',
        betaTag: '11.30.0-beta.2',
        preferBetas: true,
      })

      expect(plugin.updateAvailable).toBe(false)
    })
  })

  describe('getAllowedInstallScripts (#2909)', () => {
    const call = (name: string, version: string) =>
      (pluginsService as any).getAllowedInstallScripts(name, version) as Promise<{ allowed: string[], withScripts: string[] }>

    beforeEach(() => {
      // Prime the cached npm major version so the tests never shell out.
      ;(pluginsService as any).npmMajorVersion = 12
    })

    it('returns empty lists on npm older than 12 without hitting the registry', async () => {
      ;(pluginsService as any).npmMajorVersion = 10
      const getSpy = vi.spyOn(httpService, 'get')

      await expect(call('homebridge-mock-plugin', '1.0.0')).resolves.toEqual({ allowed: [], withScripts: [] })
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

      // The plugin itself has no install script, so it is allowed but is not
      // expected to run anything.
      await expect(call('homebridge-mock-plugin', '1.0.0')).resolves.toEqual({
        allowed: [
          'homebridge-mock-plugin',
          '@stoprocent/noble@2.3.4',
          'ffmpeg-for-homebridge',
        ],
        withScripts: [
          '@stoprocent/noble@2.3.4',
          'ffmpeg-for-homebridge',
        ],
      })
      getSpy.mockRestore()
    })

    it('reports the plugin itself as script-running when its manifest has an install script', async () => {
      const getSpy = vi.spyOn(httpService, 'get').mockReturnValue(of({
        data: {
          versions: {
            '1.0.0': { scripts: { postinstall: 'node scripts/setup.js' } },
          },
        },
      }) as any)

      await expect(call('homebridge-mock-plugin', '1.0.0')).resolves.toEqual({
        allowed: ['homebridge-mock-plugin'],
        withScripts: ['homebridge-mock-plugin@1.0.0'],
      })
      getSpy.mockRestore()
    })

    it('honours the registry hasInstallScript flag when scripts are stripped', async () => {
      const getSpy = vi.spyOn(httpService, 'get').mockReturnValue(of({
        data: {
          versions: {
            '1.0.0': { hasInstallScript: true },
          },
        },
      }) as any)

      await expect(call('homebridge-mock-plugin', '1.0.0')).resolves.toEqual({
        allowed: ['homebridge-mock-plugin'],
        withScripts: ['homebridge-mock-plugin@1.0.0'],
      })
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

      await expect(call('homebridge-mock-plugin', '2.0.0')).resolves.toEqual({
        allowed: ['homebridge-mock-plugin', 'ffmpeg-for-homebridge'],
        withScripts: ['ffmpeg-for-homebridge'],
      })
      getSpy.mockRestore()
    })

    it('still allows the plugin itself when it declares no allowScripts', async () => {
      const getSpy = vi.spyOn(httpService, 'get').mockReturnValue(of({
        data: { versions: { '1.0.0': {} } },
      }) as any)

      await expect(call('homebridge-mock-plugin', '1.0.0')).resolves.toEqual({
        allowed: ['homebridge-mock-plugin'],
        withScripts: [],
      })
      getSpy.mockRestore()
    })

    it('still allows the plugin itself when the registry lookup fails', async () => {
      const getSpy = vi.spyOn(httpService, 'get').mockImplementation(() => {
        throw new Error('registry unreachable')
      })

      await expect(call('homebridge-mock-plugin', '1.0.0')).resolves.toEqual({
        allowed: ['homebridge-mock-plugin'],
        withScripts: [],
      })
      getSpy.mockRestore()
    })
  })

  describe('getHomebridgeUiPackage - which install sets the version', () => {
    let shadowPath: string
    let runningPath: string

    beforeEach(async () => {
      runningPath = resolve(process.env.UIX_BASE_PATH)
      shadowPath = resolve(process.env.UIX_STORAGE_PATH, 'fake-ui', 'node_modules', 'homebridge-config-ui-x')
      await mkdir(shadowPath, { recursive: true })
      await writeFile(join(shadowPath, 'package.json'), JSON.stringify({
        name: 'homebridge-config-ui-x',
        version: '0.0.1-shadow',
      }))

      // customPluginPath is searched first by getBasePaths(), so a copy of the UI in
      // the plugin directory is returned before the one actually running
      vi.spyOn(pluginsService as any, 'getInstalledModules').mockResolvedValue([
        { name: 'homebridge-config-ui-x', path: resolve(shadowPath, '..'), installPath: shadowPath },
        { name: 'homebridge-config-ui-x', path: resolve(runningPath, '..'), installPath: runningPath },
      ])
      // keep the npm lookup out of it - this is only about which package.json is read
      vi.spyOn(pluginsService as any, 'getPluginFromNpm').mockImplementation(async (pkg: any) => {
        pkg.latestVersion = null
        return pkg
      })

      // the duplicate warning fires once per process, so clear it between tests
      ;(pluginsService as any).warnedDuplicateUiInstall = false
    })

    // Regression: a second copy of the UI in the plugin directory shadowed the real
    // installation, so the UI reported that copy's version as its own. On a beta that
    // meant being offered an "update" to the version already running - and npm puts the
    // copy back on every plugin update, so it kept coming back.
    it('reports the version of the install that is actually running', async () => {
      const running = await readJson(join(runningPath, 'package.json'))

      const uiPackage = await pluginsService.getHomebridgeUiPackage()

      expect(uiPackage.installedVersion).toBe(running.version)
      expect(uiPackage.installedVersion).not.toBe('0.0.1-shadow')
    })

    it('still works when only one installation is found', async () => {
      vi.spyOn(pluginsService as any, 'getInstalledModules').mockResolvedValue([
        { name: 'homebridge-config-ui-x', path: resolve(shadowPath, '..'), installPath: shadowPath },
      ])

      const uiPackage = await pluginsService.getHomebridgeUiPackage()

      expect(uiPackage.installedVersion).toBe('0.0.1-shadow')
    })

    it('falls back to the first match when none of them is the running install', async () => {
      const otherPath = resolve(process.env.UIX_STORAGE_PATH, 'fake-ui-2', 'node_modules', 'homebridge-config-ui-x')
      await mkdir(otherPath, { recursive: true })
      await writeFile(join(otherPath, 'package.json'), JSON.stringify({
        name: 'homebridge-config-ui-x',
        version: '0.0.2-other',
      }))
      vi.spyOn(pluginsService as any, 'getInstalledModules').mockResolvedValue([
        { name: 'homebridge-config-ui-x', path: resolve(shadowPath, '..'), installPath: shadowPath },
        { name: 'homebridge-config-ui-x', path: resolve(otherPath, '..'), installPath: otherPath },
      ])

      // no throw, and a deterministic answer rather than whichever the scan happened to hit
      const uiPackage = await pluginsService.getHomebridgeUiPackage()

      expect(uiPackage.installedVersion).toBe('0.0.1-shadow')
    })

    // UIX_BASE_PATH can be set by the user through UIX_BASE_PATH_OVERRIDE, so it will not
    // always be normalised the way resolve() leaves it. Comparing raw strings would miss
    // the running install and quietly fall back to the shadow copy.
    it('matches the running install despite a trailing separator on UIX_BASE_PATH', async () => {
      const original = process.env.UIX_BASE_PATH
      process.env.UIX_BASE_PATH = `${original}${sep}`

      try {
        const running = await readJson(join(runningPath, 'package.json'))
        const uiPackage = await pluginsService.getHomebridgeUiPackage()

        expect(uiPackage.installedVersion).toBe(running.version)
      } finally {
        process.env.UIX_BASE_PATH = original
      }
    })

    describe('the duplicate-install warning', () => {
      let warnSpy: any

      beforeEach(() => {
        warnSpy = vi.spyOn((pluginsService as any).logger, 'warn').mockImplementation(() => {})
      })

      it('names both installations so the stale one can be removed', async () => {
        await pluginsService.getHomebridgeUiPackage()

        expect(warnSpy).toHaveBeenCalledTimes(1)
        const message = warnSpy.mock.calls[0][0]
        expect(message).toContain(shadowPath)
        expect(message).toContain(runningPath)
      })

      // npm reinstates the duplicate on every plugin update, and this runs on every
      // plugin-list refresh - so warning each time would be a steady drip in the log
      it('warns only once, not on every refresh', async () => {
        await pluginsService.getHomebridgeUiPackage()
        await pluginsService.getHomebridgeUiPackage()
        await pluginsService.getHomebridgeUiPackage()

        expect(warnSpy).toHaveBeenCalledTimes(1)
      })

      it('stays quiet for the normal single-installation case', async () => {
        vi.spyOn(pluginsService as any, 'getInstalledModules').mockResolvedValue([
          { name: 'homebridge-config-ui-x', path: resolve(runningPath, '..'), installPath: runningPath },
        ])

        await pluginsService.getHomebridgeUiPackage()

        expect(warnSpy).not.toHaveBeenCalled()
      })
    })

    // The fix above only worked because getInstalledModules() had been mocked to contain
    // the running install. On a real hb-service setup the running install sits outside
    // every scanned base path, and the safety net that adds it back only ran when no copy
    // of the UI was found at all - so the shadow copy suppressed it and became the only
    // candidate. That put a beta Pi back in exactly the original broken state, reporting
    // the shadow's stable version and offering an update to the beta already running.
    describe('when the running install is outside the scanned paths', () => {
      beforeEach(() => {
        vi.restoreAllMocks()
        // only the shadow copy is discoverable, as on a real Pi
        vi.spyOn(pluginsService as any, 'paths', 'get').mockReturnValue([resolve(shadowPath, '..')])
        vi.spyOn(pluginsService as any, 'getPluginFromNpm').mockImplementation(async (pkg: any) => {
          pkg.latestVersion = null
          return pkg
        })
        ;(pluginsService as any).warnedDuplicateUiInstall = false
      })

      it('still finds the running install in the module scan', async () => {
        const modules = await (pluginsService as any).getInstalledModules()
        const uiModules = modules.filter((x: any) => x.name === 'homebridge-config-ui-x')

        expect(uiModules.map((x: any) => resolve(x.installPath))).toContain(runningPath)
      })

      it('reports the running version, not the shadow copy it happens to find', async () => {
        const running = await readJson(join(runningPath, 'package.json'))

        const uiPackage = await pluginsService.getHomebridgeUiPackage()

        expect(uiPackage.installedVersion).toBe(running.version)
        expect(uiPackage.installedVersion).not.toBe('0.0.1-shadow')
      })
    })
  })

  describe('manageUi - which install gets updated', () => {
    let npmSpy: any
    let runningParent: string
    let shadowParent: string

    beforeEach(async () => {
      runningParent = dirname(resolve(process.env.UIX_BASE_PATH))
      shadowParent = resolve(process.env.UIX_STORAGE_PATH, 'fake-ui-plugins', 'node_modules')

      // the plugin list dedupes in favour of the non-global copy, so the shadow
      // comes first - exactly the order manageUi used to take blindly
      ;(pluginsService as any).installedPlugins = [
        { name: 'homebridge-config-ui-x', installPath: shadowParent, globalInstall: false },
        { name: 'homebridge-config-ui-x', installPath: runningParent, globalInstall: true },
      ]

      vi.spyOn(pluginsService as any, 'getInstalledPlugins').mockResolvedValue([])
      vi.spyOn(pluginsService as any, 'isUiUpdateBundleAvailable').mockResolvedValue('')
      vi.spyOn(pluginsService as any, 'applyAllowScripts').mockResolvedValue(undefined)
      vi.spyOn(pluginsService as any, 'cleanNpmCache').mockResolvedValue(undefined)
      npmSpy = vi.spyOn(pluginsService as any, 'runNpmCommand').mockResolvedValue(undefined)
    })

    // Regression: the UI carries the 'homebridge-plugin' keyword, so it is deduped like
    // a plugin and the dedup prefers a non-global copy. A second copy of the UI under the
    // plugin path was therefore the one npm updated, leaving the install that is actually
    // running untouched - so the same update kept being offered after every restart.
    it('installs into the installation that is actually running', async () => {
      await (pluginsService as any).manageUi(
        'install',
        { name: 'homebridge-config-ui-x', version: '9.9.9' },
        new EventEmitter(),
      )

      expect(npmSpy).toHaveBeenCalledTimes(1)
      const [, cwd] = npmSpy.mock.calls[0]
      expect(cwd).toBe(resolve(runningParent, '../'))
      expect(cwd).not.toBe(resolve(shadowParent, '../'))
    })

    it('falls back to the only installation when there is just one', async () => {
      ;(pluginsService as any).installedPlugins = [
        { name: 'homebridge-config-ui-x', installPath: shadowParent, globalInstall: false },
      ]

      await (pluginsService as any).manageUi(
        'install',
        { name: 'homebridge-config-ui-x', version: '9.9.9' },
        new EventEmitter(),
      )

      const [, cwd] = npmSpy.mock.calls[0]
      expect(cwd).toBe(resolve(shadowParent, '../'))
    })
  })

  describe('getHomebridgePackage - which install sets the version (#2897)', () => {
    let configService: ConfigService
    let fakeInstallPath: string

    beforeEach(async () => {
      configService = app.get(ConfigService)
      fakeInstallPath = resolve(process.env.UIX_STORAGE_PATH, 'fake-homebridge', 'node_modules', 'homebridge')
      await mkdir(fakeInstallPath, { recursive: true })
      await writeFile(join(fakeInstallPath, 'package.json'), JSON.stringify({ name: 'homebridge', version: '2.1.1' }))

      vi.spyOn(pluginsService as any, 'getInstalledModules').mockResolvedValue([
        { name: 'homebridge', path: fakeInstallPath, installPath: fakeInstallPath },
      ])
      vi.spyOn(pluginsService as any, 'parsePackageJson').mockResolvedValue({
        name: 'homebridge',
        installedVersion: '2.1.1',
        latestVersion: '2.2.0',
      })
      configService.ui.homebridgeUpdatePolicy = 'none'
    })

    it('does not let a discovered-but-not-running install overwrite the IPC version', async () => {
      // hb-service reported launching a copy that is not among the scanned paths
      // (the reporter had an apt install plus one under the plugin path). Without
      // the guard, this disk scan overwrote the real running version, so the UI
      // showed one version on load and another after a refresh.
      configService.runningHomebridgeModulePath = resolve(process.env.UIX_STORAGE_PATH, 'some-other-homebridge')
      configService.homebridgeVersion = '1.9.0'

      await pluginsService.getHomebridgePackage()

      expect(configService.homebridgeVersion).toBe('1.9.0')
    })

    it('uses the running install when two Homebridge installations are discovered', async () => {
      const runningInstallPath = resolve(process.env.UIX_STORAGE_PATH, 'running-homebridge', 'node_modules', 'homebridge')
      const runningModulePath = resolve(process.env.UIX_STORAGE_PATH, 'running-homebridge-link')
      await mkdir(runningInstallPath, { recursive: true })
      await writeFile(join(runningInstallPath, 'package.json'), JSON.stringify({ name: 'homebridge', version: '1.9.0' }))
      await remove(runningModulePath)
      await symlink(runningInstallPath, runningModulePath, 'junction')

      vi.mocked((pluginsService as any).getInstalledModules).mockResolvedValue([
        { name: 'homebridge', path: fakeInstallPath, installPath: fakeInstallPath },
        { name: 'homebridge', path: runningInstallPath, installPath: runningInstallPath },
      ])
      vi.mocked((pluginsService as any).parsePackageJson).mockImplementation(async (pkg: { version: string }) => ({
        name: 'homebridge',
        installedVersion: pkg.version,
        latestVersion: '2.2.0',
      }))
      // hb-service can report the symlinked path used to launch Homebridge,
      // while plugin discovery finds the real installation directory.
      homebridgeIpcService.setHomebridgeVersion('1.9.0', runningModulePath)

      const homebridge = await pluginsService.getHomebridgePackage()

      expect(homebridge.installedVersion).toBe('1.9.0')
      expect(homebridge.multipleInstances).toBe(true)
      expect(configService.homebridgeVersion).toBe('1.9.0')
    })

    it('sets the version from disk when hb-service has not reported a running module', async () => {
      configService.runningHomebridgeModulePath = undefined
      configService.homebridgeVersion = '1.9.0'

      await pluginsService.getHomebridgePackage()

      expect(configService.homebridgeVersion).toBe('2.1.1')
    })

    it('sets the version from disk when the discovered install is the running one', async () => {
      configService.runningHomebridgeModulePath = fakeInstallPath
      configService.homebridgeVersion = '1.9.0'

      await pluginsService.getHomebridgePackage()

      expect(configService.homebridgeVersion).toBe('2.1.1')
    })
  })

  describe('getInstalledModules - a running install outside the scanned paths (#2897)', () => {
    let configService: ConfigService
    let scannedPath: string
    let unscannedPath: string

    const getInstalledModules = () =>
      (pluginsService as any).getInstalledModules() as Promise<Array<{ name: string, path: string, installPath: string }>>

    beforeEach(async () => {
      configService = app.get(ConfigService)

      // The copy the base path scan can see, standing in for the stale second install
      scannedPath = resolve(process.env.UIX_STORAGE_PATH, 'plugins', 'node_modules', 'homebridge')
      await mkdir(scannedPath, { recursive: true })
      await writeFile(join(scannedPath, 'package.json'), JSON.stringify({ name: 'homebridge', version: '2.1.1' }))

      // The one hb-service actually launched, in an /opt/homebridge style location
      // that is not among the scanned base paths
      unscannedPath = resolve(process.env.UIX_STORAGE_PATH, 'opt-homebridge', 'lib', 'node_modules', 'homebridge')
      await mkdir(unscannedPath, { recursive: true })
      await writeFile(join(unscannedPath, 'package.json'), JSON.stringify({ name: 'homebridge', version: '1.9.0' }))

      configService.runningHomebridgeModulePath = unscannedPath
    })

    afterEach(async () => {
      configService.runningHomebridgeModulePath = undefined
      await remove(resolve(process.env.UIX_STORAGE_PATH, 'opt-homebridge'))
      await remove(scannedPath)
    })

    // Regression: the scan only ever returned installs under the base paths, so the
    // apt and Pi image location was invisible. findRunningHomebridgeInstall then had
    // nothing to match and getHomebridgePackage fell back to the first discovered
    // install - the copy that is not running.
    it('includes the running install so it can be matched', async () => {
      const modules = await getInstalledModules()
      const homebridgeInstalls = modules.filter(x => x.name === 'homebridge')

      expect(homebridgeInstalls.some(x => x.installPath === unscannedPath)).toBe(true)
    })

    it('reports the running version rather than the discovered one', async () => {
      const homebridge = await pluginsService.getHomebridgePackage()

      expect(homebridge.installedVersion).toBe('1.9.0')
      expect(configService.homebridgeVersion).toBe('1.9.0')
    })

    it('resolves the running path through a symlink without listing it twice', async () => {
      const linkPath = resolve(process.env.UIX_STORAGE_PATH, 'opt-homebridge-link')
      await remove(linkPath)
      await symlink(unscannedPath, linkPath, 'junction')
      configService.runningHomebridgeModulePath = linkPath

      const modules = await getInstalledModules()
      const homebridgeInstalls = modules.filter(x => x.name === 'homebridge')

      expect(homebridgeInstalls.filter(x => x.installPath === unscannedPath)).toHaveLength(1)
      expect(homebridgeInstalls.some(x => x.installPath === linkPath)).toBe(false)
      await remove(linkPath)
    })

    it('leaves the scan alone when the running path has no package.json', async () => {
      configService.runningHomebridgeModulePath = resolve(process.env.UIX_STORAGE_PATH, 'opt-homebridge', 'empty')

      const modules = await getInstalledModules()

      expect(modules.some(x => x.name === 'homebridge' && x.installPath === scannedPath)).toBe(true)
      expect(modules.some(x => x.installPath.endsWith('empty'))).toBe(false)
    })

    it('leaves the scan alone when the running path does not exist', async () => {
      configService.runningHomebridgeModulePath = resolve(process.env.UIX_STORAGE_PATH, 'does-not-exist', 'homebridge')

      const modules = await getInstalledModules()

      expect(modules.some(x => x.name === 'homebridge' && x.installPath === scannedPath)).toBe(true)
    })
  })

  describe('performPackageUpdate - the shared restart-free update path', () => {
    // The whole point of the extraction: the update itself must never restart
    // anything. It reports what restart it calls for; the caller (the single
    // package endpoint today, the Update All orchestrator later) decides when.
    const client = new EventEmitter()

    it('updates homebridge and asks for a homebridge restart, doing none itself', async () => {
      const update = vi.spyOn(pluginsService, 'updateHomebridgePackage').mockResolvedValue(undefined as any)
      const restart = vi.spyOn(homebridgeIpcService, 'restartHomebridge').mockImplementation(() => undefined)
      const uiRestart = vi.spyOn(pluginsService as any, 'scheduleUiRestart')

      const result = await pluginsService.performPackageUpdate('homebridge', '2.4.0', client)

      expect(update).toHaveBeenCalledWith({ version: '2.4.0' }, client)
      expect(result).toEqual({
        ok: true,
        name: 'homebridge',
        version: '2.4.0',
        restart: { homebridge: true, ui: false, childBridgeUsernames: [] },
      })
      expect(restart).not.toHaveBeenCalled()
      expect(uiRestart).not.toHaveBeenCalled()
    })

    it('updates the ui and asks for a ui restart, without arming the exit timer', async () => {
      const manage = vi.spyOn(pluginsService, 'managePlugin').mockResolvedValue(true)
      const uiRestart = vi.spyOn(pluginsService as any, 'scheduleUiRestart')

      const result = await pluginsService.performPackageUpdate('homebridge-config-ui-x', '5.27.1', client)

      expect(manage).toHaveBeenCalledWith('install', { name: 'homebridge-config-ui-x', version: '5.27.1' }, client)
      expect(result.restart).toEqual({ homebridge: false, ui: true, childBridgeUsernames: [] })
      expect(uiRestart).not.toHaveBeenCalled()
    })

    it('updates a plugin on child bridges and names them instead of asking for a homebridge restart', async () => {
      vi.spyOn(pluginsService, 'managePlugin').mockResolvedValue(true)
      vi.spyOn(pluginsService, 'getPluginChildBridgeUsernames').mockResolvedValue(['0E:11:22:33:44:55'])
      const bridgeRestart = vi.spyOn(childBridgesService, 'restartChildBridge').mockReturnValue(undefined as any)

      const result = await pluginsService.performPackageUpdate('homebridge-mock-plugin', '1.1.0', client)

      expect(result.restart).toEqual({ homebridge: false, ui: false, childBridgeUsernames: ['0E:11:22:33:44:55'] })
      expect(bridgeRestart).not.toHaveBeenCalled()
    })

    it('updates a main-bridge plugin and asks for a homebridge restart', async () => {
      vi.spyOn(pluginsService, 'managePlugin').mockResolvedValue(true)
      vi.spyOn(pluginsService, 'getPluginChildBridgeUsernames').mockResolvedValue([])

      const result = await pluginsService.performPackageUpdate('homebridge-mock-plugin', '1.1.0', client)

      expect(result.restart).toEqual({ homebridge: true, ui: false, childBridgeUsernames: [] })
    })

    it('reports a failed update instead of throwing, and asks for no restart', async () => {
      vi.spyOn(pluginsService, 'managePlugin').mockRejectedValue(new Error('npm exploded'))

      const result = await pluginsService.performPackageUpdate('homebridge-mock-plugin', '1.1.0', client)

      expect(result.ok).toBe(false)
      expect(result.error).toBe('npm exploded')
      expect(result.restart).toEqual({ homebridge: false, ui: false, childBridgeUsernames: [] })
    })
  })

  describe('package operation serialisation (updater#278)', () => {
    // POST /plugins/update/:name returns once its npm run is SCHEDULED, so
    // back-to-back calls (an auto-updater applying several updates) used to
    // run npm concurrently in one node_modules tree and corrupt it. Every
    // package operation now goes through one queue, and the ui's self-restart
    // waits for the queue to drain - exiting kills any in-flight npm child,
    // leaving the package it was unpacking broken on disk.
    const client = new EventEmitter()

    const deferred = () => {
      let resolve!: () => void
      const promise = new Promise<void>((res) => {
        resolve = res
      })
      return { promise, resolve }
    }

    const flush = () => new Promise(resolve => setImmediate(resolve))

    it('runs package operations one at a time, in call order', async () => {
      const gate = deferred()
      const order: string[] = []
      const doManage = vi.spyOn(pluginsService as any, 'doManagePlugin').mockImplementation(async (...args: any[]) => {
        const pluginAction = args[1]
        order.push(`start-${pluginAction.name}`)
        if (pluginAction.name === 'homebridge-first') {
          await gate.promise
        }
        order.push(`end-${pluginAction.name}`)
        return true
      })

      const first = pluginsService.managePlugin('install', { name: 'homebridge-first', version: '1.0.0' } as any, client)
      const second = pluginsService.managePlugin('install', { name: 'homebridge-second', version: '1.0.0' } as any, client)
      await flush()

      // The second operation must not have started while the first is inside npm
      expect(order).toEqual(['start-homebridge-first'])

      gate.resolve()
      await Promise.all([first, second])
      expect(order).toEqual(['start-homebridge-first', 'end-homebridge-first', 'start-homebridge-second', 'end-homebridge-second'])

      doManage.mockRestore()
    })

    it('a homebridge update queues behind a plugin operation', async () => {
      const gate = deferred()
      const order: string[] = []
      const doManage = vi.spyOn(pluginsService as any, 'doManagePlugin').mockImplementation(async () => {
        order.push('start-plugin')
        await gate.promise
        order.push('end-plugin')
        return true
      })
      const doUpdate = vi.spyOn(pluginsService as any, 'doUpdateHomebridgePackage').mockImplementation(async () => {
        order.push('homebridge')
        return true
      })

      const first = pluginsService.managePlugin('install', { name: 'homebridge-mock-plugin', version: '1.0.0' } as any, client)
      const second = pluginsService.updateHomebridgePackage({ version: '2.4.0' } as any, client)
      await flush()
      expect(order).toEqual(['start-plugin'])

      gate.resolve()
      await Promise.all([first, second])
      expect(order).toEqual(['start-plugin', 'end-plugin', 'homebridge'])

      doManage.mockRestore()
      doUpdate.mockRestore()
    })

    it('a failed operation surfaces its error to its own caller without blocking the queue', async () => {
      const doManage = vi.spyOn(pluginsService as any, 'doManagePlugin')
        .mockRejectedValueOnce(new Error('npm exploded'))
        .mockResolvedValueOnce(true)

      const first = pluginsService.managePlugin('install', { name: 'homebridge-broken', version: '1.0.0' } as any, client)
      const second = pluginsService.managePlugin('install', { name: 'homebridge-fine', version: '1.0.0' } as any, client)

      await expect(first).rejects.toThrow('npm exploded')
      await expect(second).resolves.toBe(true)

      doManage.mockRestore()
    })

    it('the ui self-restart exit waits for the in-flight operation to finish', async () => {
      const gate = deferred()
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as any)
      const doManage = vi.spyOn(pluginsService as any, 'doManagePlugin').mockImplementation(async () => {
        await gate.promise
        return true
      })
      // Simulate the armed self-restart timer - exitOnceUpdatesFinish refuses
      // to exit once onModuleDestroy has cleared it
      const fakeTimer = setTimeout(() => {}, 60000);
      (pluginsService as any).uiRestartTimer = fakeTimer

      try {
        const update = pluginsService.managePlugin('install', { name: 'homebridge-slow', version: '1.0.0' } as any, client)
        const exitPromise = (pluginsService as any).exitOnceUpdatesFinish() as Promise<void>
        await flush()

        // npm is still running - the exit must not have happened
        expect(exitSpy).not.toHaveBeenCalled()

        gate.resolve()
        await update
        await exitPromise
        expect(exitSpy).toHaveBeenCalledWith(0)
      } finally {
        clearTimeout(fakeTimer);
        (pluginsService as any).uiRestartTimer = undefined
        exitSpy.mockRestore()
        doManage.mockRestore()
      }
    })

    it('never exits after the module owning the timer has been torn down', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as any);
      (pluginsService as any).uiRestartTimer = undefined

      try {
        await (pluginsService as any).exitOnceUpdatesFinish()
        expect(exitSpy).not.toHaveBeenCalled()
      } finally {
        exitSpy.mockRestore()
      }
    })
  })

  describe('filterLocallyHandledScripts (#2909)', () => {
    const call = (scriptPackages: string[], localAllowScripts: unknown) =>
      (pluginsService as any).filterLocallyHandledScripts(scriptPackages, localAllowScripts) as string[]

    it('keeps every package when there is no local allowScripts', () => {
      expect(call(['homebridge-mock-plugin@1.0.0', 'ffmpeg-for-homebridge'], undefined))
        .toEqual(['homebridge-mock-plugin@1.0.0', 'ffmpeg-for-homebridge'])
    })

    it('drops packages allowed with a bare name', () => {
      expect(call(['homebridge-mock-plugin@1.0.0'], { 'homebridge-mock-plugin': true }))
        .toEqual([])
    })

    it('drops packages allowed with the exact version pin', () => {
      expect(call(['homebridge-mock-plugin@1.0.0'], { 'homebridge-mock-plugin@1.0.0': true }))
        .toEqual([])
    })

    it('keeps a package whose true entry pins a different version', () => {
      // Updating 1.0.0 -> 1.1.0 with a stale pin still blocks the script, so
      // the warning must fire.
      expect(call(['homebridge-mock-plugin@1.1.0'], { 'homebridge-mock-plugin@1.0.0': true }))
        .toEqual(['homebridge-mock-plugin@1.1.0'])
    })

    it('drops explicitly denied packages whatever version the entry names', () => {
      expect(call(
        ['homebridge-mock-plugin@1.1.0', '@scarf/scarf'],
        { 'homebridge-mock-plugin@1.0.0': false, '@scarf/scarf': false },
      )).toEqual([])
    })

    it('handles scoped dependency keys with version pins', () => {
      expect(call(
        ['@stoprocent/noble@2.3.4', 'ffmpeg-for-homebridge'],
        { '@stoprocent/noble@2.3.4': true },
      )).toEqual(['ffmpeg-for-homebridge'])
    })

    it('treats array-form local entries as allowed', () => {
      expect(call(
        ['homebridge-mock-plugin@1.0.0', 'ffmpeg-for-homebridge'],
        ['ffmpeg-for-homebridge'],
      )).toEqual(['homebridge-mock-plugin@1.0.0'])
    })
  })

  afterAll(async () => {
    // Close first: PluginsService.onModuleDestroy clears any restart still
    // pending, so nothing can fire once the spy is gone.
    await app.close()
    exitSpy.mockRestore()
  })
})
