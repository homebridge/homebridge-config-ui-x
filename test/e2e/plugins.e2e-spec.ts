import { resolve } from 'node:path'
import process from 'node:process'

import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { HttpService } from '@nestjs/axios'

import { ValidationPipe } from '@nestjs/common'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { copy, remove } from 'fs-extra'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'

import { AuthModule } from '../../src/core/auth/auth.module'

import { PluginsModule } from '../../src/modules/plugins/plugins.module'
import type { HomebridgePlugin } from '../../src/modules/plugins/types'

describe('PluginController (e2e)', () => {
  let app: NestFastifyApplication
  let httpService: HttpService

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

    // setup test config
    await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH)

    // setup test auth file
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
  })

  beforeEach(async () => {
    jest.resetAllMocks()

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

  it('GET /plugins/search/:query (blacklisted - search query', async () => {
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

  afterAll(async () => {
    await app.close()
  })
})
