import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'

import type { HomebridgeConfig } from '../../src/core/config/config.interfaces.js'

import { resolve } from 'node:path'
import process from 'node:process'

import { ValidationPipe } from '@nestjs/common'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import dayjs from 'dayjs'
import {
  copy,
  emptyDir,
  ensureDir,
  pathExists,
  readdir,
  readJson,
  remove,
  writeFile,
  writeJson,
} from 'fs-extra'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthModule } from '../../src/core/auth/auth.module.js'
import { ConfigService } from '../../src/core/config/config.service.js'
import { SchedulerService } from '../../src/core/scheduler/scheduler.service.js'
import { BackupModule } from '../../src/modules/backup/backup.module.js'
import { BackupService } from '../../src/modules/backup/backup.service.js'
import { ChildBridgesService } from '../../src/modules/child-bridges/child-bridges.service.js'
import { ConfigEditorModule } from '../../src/modules/config-editor/config-editor.module.js'
import { ConfigEditorService } from '../../src/modules/config-editor/config-editor.service.js'

describe('ConfigEditorController (e2e)', () => {
  let app: NestFastifyApplication

  let authFilePath: string
  let secretsFilePath: string
  let configFilePath: string
  let authorization: string
  let backupFilePath: string
  let pluginsPath: string

  let schedulerService: SchedulerService
  let configEditorService: ConfigEditorService
  let backupService: BackupService
  let homebridgeConfigService: ConfigService
  let originalHomebridgeVersion: string

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = resolve(__dirname, '../../')
    process.env.UIX_STORAGE_PATH = resolve(__dirname, '../', '.homebridge')
    process.env.UIX_CONFIG_PATH = resolve(process.env.UIX_STORAGE_PATH, 'config.json')
    process.env.UIX_CUSTOM_PLUGIN_PATH = resolve(process.env.UIX_STORAGE_PATH, 'plugins/node_modules')

    authFilePath = resolve(process.env.UIX_STORAGE_PATH, 'auth.json')
    secretsFilePath = resolve(process.env.UIX_STORAGE_PATH, '.uix-secrets')
    configFilePath = process.env.UIX_CONFIG_PATH
    backupFilePath = resolve(process.env.UIX_STORAGE_PATH, 'backups', 'config-backups')
    pluginsPath = process.env.UIX_CUSTOM_PLUGIN_PATH

    // Setup test config
    await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH)

    // Setup test auth file
    await copy(resolve(__dirname, '../mocks', 'auth.json'), authFilePath)
    await copy(resolve(__dirname, '../mocks', '.uix-secrets'), secretsFilePath)

    // copy test plugins
    await remove(pluginsPath)
    await copy(resolve(__dirname, '../mocks', 'plugins'), pluginsPath)

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigEditorModule, AuthModule, BackupModule],
    }).compile()

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter())

    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      skipMissingProperties: true,
    }))

    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    schedulerService = app.get(SchedulerService)
    configEditorService = app.get(ConfigEditorService)
    backupService = app.get(BackupService)
    homebridgeConfigService = app.get(ConfigService)
    originalHomebridgeVersion = homebridgeConfigService.homebridgeVersion

    // Wait for initial paths to be setup
    await new Promise(res => setTimeout(res, 1000))
  })

  beforeEach(async () => {
    homebridgeConfigService.homebridgeVersion = originalHomebridgeVersion

    // Get auth token before each test
    authorization = `bearer ${(await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: {
        username: 'admin',
        password: 'admin',
      },
    })).json().access_token}`

    // Restore the default config before each test
    await copy(resolve(__dirname, '../mocks', 'config.json'), configFilePath)
  })

  it('should create the config.json backup path', async () => {
    expect(await pathExists(backupFilePath)).toBe(true)
  })

  it('should schedule a job to remove old config.json backups', async () => {
    expect(schedulerService.scheduledJobs).toHaveProperty('cleanup-config-backups')
  })

  it('should remove config.json backups older than 60 days', async () => {
    // Empty the instance backup path
    await ensureDir(backupFilePath)
    await emptyDir(backupFilePath)

    // create some fake backups
    const backupDates = [
      dayjs().subtract(600, 'day').toDate(),
      dayjs().subtract(90, 'day').toDate(),
      dayjs().subtract(80, 'day').toDate(),
      dayjs().subtract(70, 'day').toDate(),
      dayjs().subtract(65, 'day').toDate(),
      dayjs().subtract(60, 'day').toDate(),
      dayjs().subtract(20, 'day').toDate(),
      dayjs().subtract(10, 'day').toDate(),
      dayjs().subtract(6, 'day').toDate(),
      dayjs().subtract(5, 'day').toDate(),
      dayjs().subtract(0, 'day').toDate(),
    ]

    for (const fakeBackupDate of backupDates) {
      const backupFileName = `config.json.${fakeBackupDate.getTime().toString()}`
      await writeFile(resolve(backupFilePath, backupFileName), 'xyz')
    }

    // Do a sanity check beforehand
    const backupsBeforeCleanup = await readdir(backupFilePath)
    expect(backupsBeforeCleanup).toHaveLength(11)

    // Run cleanup job
    await configEditorService.cleanupConfigBackups()

    // There should only be 5 backups on disk now
    const backupsAfterJob = await readdir(backupFilePath)
    expect(backupsAfterJob).toHaveLength(5)

    // Empty the directory again
    await emptyDir(backupFilePath)
  })

  it('GET /config-editor', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/config-editor',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual(await readJson(configFilePath))
  })

  it('POST /config-editor (valid config)', async () => {
    const currentConfig: HomebridgeConfig = await readJson(configFilePath)

    currentConfig.bridge.name = 'Changed Name'

    const res = await app.inject({
      method: 'POST',
      path: '/config-editor',
      headers: {
        authorization,
      },
      payload: currentConfig,
    })

    expect(res.statusCode).toBe(201)

    // check the updates were saved to disk
    expect(currentConfig).toEqual(await readJson(configFilePath))
  })

  it('POST /config-editor?include=restart-info (still succeeds when child-bridge IPC throws)', async () => {
    const childBridgesService = app.get(ChildBridgesService)
    const spy = vi.spyOn(childBridgesService, 'getChildBridges').mockRejectedValue(new Error('IPC offline'))

    const currentConfig: HomebridgeConfig = await readJson(configFilePath)
    currentConfig.bridge.name = 'Renamed via wrapper'

    try {
      const res = await app.inject({
        method: 'POST',
        path: '/config-editor?include=restart-info',
        headers: { authorization },
        payload: currentConfig,
      })

      expect(res.statusCode).toBe(201)
      expect(res.json().affectedBridges).toEqual([])
      // Save still committed even though the IPC fetch failed.
      expect((await readJson(configFilePath)).bridge.name).toBe('Renamed via wrapper')
    } finally {
      spy.mockRestore()
    }
  })

  it('POST /config-editor (missing required attributes)', async () => {
    const currentConfig: HomebridgeConfig = await readJson(configFilePath)

    delete currentConfig.bridge
    delete currentConfig.accessories
    delete currentConfig.platforms

    currentConfig.plugins = []

    const res = await app.inject({
      method: 'POST',
      path: '/config-editor',
      headers: {
        authorization,
      },
      payload: currentConfig,
    })

    expect(res.statusCode).toBe(201)

    // check the updates were saved to disk and mistakes corrected
    const savedConfig: HomebridgeConfig = await readJson(configFilePath)
    expect(savedConfig).toHaveProperty('bridge')
    expect(savedConfig.platforms).toHaveLength(0)
    expect(savedConfig.accessories).toHaveLength(0)
    expect(savedConfig).not.toHaveProperty('plugins')
  })

  it('POST /config-editor (convert bridge.port to number)', async () => {
    const currentConfig = await readJson(configFilePath)

    currentConfig.bridge.port = '12345'

    const res = await app.inject({
      method: 'POST',
      path: '/config-editor',
      headers: {
        authorization,
      },
      payload: currentConfig,
    })

    expect(res.statusCode).toBe(201)

    // check the updates were saved to disk and mistakes corrected
    const savedConfig: HomebridgeConfig = await readJson(configFilePath)
    expect(typeof savedConfig.bridge.port).toBe('number')
    expect(savedConfig.bridge.port).toBe(12345)
  })

  it('POST /config-editor (correct bridge.port if invalid value is provided)', async () => {
    const currentConfig = await readJson(configFilePath)

    currentConfig.bridge.port = {
      not: 'valid',
    }

    const res = await app.inject({
      method: 'POST',
      path: '/config-editor',
      headers: {
        authorization,
      },
      payload: currentConfig,
    })

    expect(res.statusCode).toBe(201)

    // check the updates were saved to disk and mistakes corrected
    const savedConfig: HomebridgeConfig = await readJson(configFilePath)
    expect(typeof savedConfig.bridge.port).toBe('number')
    expect(savedConfig.bridge.port).toBeGreaterThanOrEqual(51000)
    expect(savedConfig.bridge.port).toBeLessThanOrEqual(52000)
  })

  it('POST /config-editor (accept bridge.port if a valid value is provided)', async () => {
    const currentConfig = await readJson(configFilePath)

    currentConfig.bridge.port = 8080

    const res = await app.inject({
      method: 'POST',
      path: '/config-editor',
      headers: {
        authorization,
      },
      payload: currentConfig,
    })

    expect(res.statusCode).toBe(201)

    // check the updates were saved to disk and mistakes corrected
    const savedConfig: HomebridgeConfig = await readJson(configFilePath)
    expect(savedConfig.bridge.port).toBe(8080)
  })

  it('POST /config-editor (correct bridge.port if port is out of range)', async () => {
    const currentConfig = await readJson(configFilePath)

    currentConfig.bridge.port = 1000000000

    const res = await app.inject({
      method: 'POST',
      path: '/config-editor',
      headers: {
        authorization,
      },
      payload: currentConfig,
    })

    expect(res.statusCode).toBe(201)

    // check the updates were saved to disk and mistakes corrected
    const savedConfig: HomebridgeConfig = await readJson(configFilePath)
    expect(typeof savedConfig.bridge.port).toBe('number')
    expect(savedConfig.bridge.port).toBeGreaterThanOrEqual(51000)
    expect(savedConfig.bridge.port).toBeLessThanOrEqual(52000)
  })

  it('POST /config-editor (correct bridge.username if an invalid value is provided)', async () => {
    const currentConfig = await readJson(configFilePath)
    const originalUsername = currentConfig.bridge.username

    currentConfig.bridge.username = 'blah blah'

    const res = await app.inject({
      method: 'POST',
      path: '/config-editor',
      headers: {
        authorization,
      },
      payload: currentConfig,
    })

    expect(res.statusCode).toBe(201)

    // check the updates were saved to disk and mistakes corrected
    const savedConfig: HomebridgeConfig = await readJson(configFilePath)
    expect(savedConfig.bridge.username).toBe(originalUsername)
  })

  it('POST /config-editor (accept bridge.username if valid value is provided)', async () => {
    const currentConfig = await readJson(configFilePath)

    currentConfig.bridge.username = '0E:B8:2B:20:76:08'

    const res = await app.inject({
      method: 'POST',
      path: '/config-editor',
      headers: {
        authorization,
      },
      payload: currentConfig,
    })

    expect(res.statusCode).toBe(201)

    // check the updates were saved to disk and mistakes corrected
    const savedConfig: HomebridgeConfig = await readJson(configFilePath)
    expect(savedConfig.bridge.username).toBe('0E:B8:2B:20:76:08')
  })

  it('POST /config-editor (correct bridge.pin if an invalid value is provided)', async () => {
    const currentConfig = await readJson(configFilePath)
    const originalPin = currentConfig.bridge.pin

    currentConfig.bridge.pin = 'blah blah'

    const res = await app.inject({
      method: 'POST',
      path: '/config-editor',
      headers: {
        authorization,
      },
      payload: currentConfig,
    })

    expect(res.statusCode).toBe(201)

    // check the updates were saved to disk and mistakes corrected
    const savedConfig: HomebridgeConfig = await readJson(configFilePath)
    expect(savedConfig.bridge.pin).toBe(originalPin)
  })

  it('POST /config-editor (accept bridge.pin if a valid value is provided)', async () => {
    const currentConfig = await readJson(configFilePath)

    currentConfig.bridge.pin = '111-11-111'

    const res = await app.inject({
      method: 'POST',
      path: '/config-editor',
      headers: {
        authorization,
      },
      payload: currentConfig,
    })

    expect(res.statusCode).toBe(201)

    // check the updates were saved to disk and mistakes corrected
    const savedConfig: HomebridgeConfig = await readJson(configFilePath)
    expect(savedConfig.bridge.pin).toBe('111-11-111')
  })

  it('POST /config-editor (correct bridge.name if an invalid value is provided)', async () => {
    const currentConfig = await readJson(configFilePath)

    currentConfig.bridge.name = 12345

    const res = await app.inject({
      method: 'POST',
      path: '/config-editor',
      headers: {
        authorization,
      },
      payload: currentConfig,
    })

    expect(res.statusCode).toBe(201)

    // check the updates were saved to disk and mistakes corrected
    const savedConfig: HomebridgeConfig = await readJson(configFilePath)
    expect(typeof savedConfig.bridge.name).toBe('string')
    expect(savedConfig.bridge.name).toContain('Homebridge')
  })

  it('POST /config-editor (accept bridge.name if a valid value is provided)', async () => {
    const currentConfig = await readJson(configFilePath)

    currentConfig.bridge.name = 'Homebridge Test!'

    const res = await app.inject({
      method: 'POST',
      path: '/config-editor',
      headers: {
        authorization,
      },
      payload: currentConfig,
    })

    expect(res.statusCode).toBe(201)

    // check the updates were saved to disk and mistakes corrected
    const savedConfig: HomebridgeConfig = await readJson(configFilePath)
    expect(savedConfig.bridge.name).toBe('Homebridge Test!')
  })

  it('POST /config-editor (remove plugins array if empty)', async () => {
    const currentConfig = await readJson(configFilePath)

    currentConfig.plugins = []

    const res = await app.inject({
      method: 'POST',
      path: '/config-editor',
      headers: {
        authorization,
      },
      payload: currentConfig,
    })

    expect(res.statusCode).toBe(201)

    // check the updates were saved to disk and mistakes corrected
    const savedConfig: HomebridgeConfig = await readJson(configFilePath)
    expect(savedConfig.plugins).toBeUndefined()
  })

  it('POST /config-editor (do not remove plugins array if not empty)', async () => {
    const currentConfig = await readJson(configFilePath)

    currentConfig.plugins = [
      'homebridge-mock-plugin',
    ]

    const res = await app.inject({
      method: 'POST',
      path: '/config-editor',
      headers: {
        authorization,
      },
      payload: currentConfig,
    })

    expect(res.statusCode).toBe(201)

    // check the updates were saved to disk and mistakes corrected
    const savedConfig: HomebridgeConfig = await readJson(configFilePath)
    expect(savedConfig.plugins).toEqual(currentConfig.plugins)
  })

  it('POST /config-editor (rewrite platforms & accessories as arrays)', async () => {
    const currentConfig = await readJson(configFilePath)

    currentConfig.accessories = 'not an array'
    currentConfig.platforms = 'not an array'

    const res = await app.inject({
      method: 'POST',
      path: '/config-editor',
      headers: {
        authorization,
      },
      payload: currentConfig,
    })

    expect(res.statusCode).toBe(201)

    // check the updates were saved to disk and mistakes corrected
    const savedConfig: HomebridgeConfig = await readJson(configFilePath)
    expect(Array.isArray(savedConfig.platforms)).toBe(true)
    expect(Array.isArray(savedConfig.accessories)).toBe(true)
    expect(savedConfig.platforms).toHaveLength(0)
    expect(savedConfig.accessories).toHaveLength(0)
  })

  it('POST /config-editor (remove config.mdns if not valid object)', async () => {
    const currentConfig = await readJson(configFilePath)
    currentConfig.mdns = 'blah'

    const res = await app.inject({
      method: 'POST',
      path: '/config-editor',
      headers: {
        authorization,
      },
      payload: currentConfig,
    })

    expect(res.statusCode).toBe(201)

    // check the updates were saved to disk and mistakes corrected
    const savedConfig: HomebridgeConfig = await readJson(configFilePath)
    expect(savedConfig.mdns).toBeUndefined()
  })

  it('POST /config-editor (retain config.mdns if valid object)', async () => {
    const currentConfig = await readJson(configFilePath)
    currentConfig.mdns = {}

    const res = await app.inject({
      method: 'POST',
      path: '/config-editor',
      headers: {
        authorization,
      },
      payload: currentConfig,
    })

    expect(res.statusCode).toBe(201)

    // check the updates were saved to disk and mistakes corrected
    const savedConfig: HomebridgeConfig = await readJson(configFilePath)
    expect(savedConfig.mdns).toEqual({})
  })

  it('GET /config-editor/plugin/:pluginName', async () => {
    const currentConfig: HomebridgeConfig = await readJson(configFilePath)

    currentConfig.platforms = [
      {
        platform: 'not it',
      },
      {
        platform: 'ExampleHomebridgePlugin',
      },
      {
        platform: 'another not it',
      },
    ]

    await writeJson(configFilePath, currentConfig)

    const res = await app.inject({
      method: 'GET',
      path: '/config-editor/plugin/homebridge-mock-plugin',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)

    // It should only return the ExampleHomebridgePlugin config
    expect(res.json()).toHaveLength(1)
    expect(res.json()[0].platform).toBe('ExampleHomebridgePlugin')
  })

  it('GET /config-editor/plugin/:pluginName (no config)', async () => {
    const currentConfig: HomebridgeConfig = await readJson(configFilePath)

    currentConfig.platforms = []

    await writeJson(configFilePath, currentConfig)

    const res = await app.inject({
      method: 'GET',
      path: '/config-editor/plugin/homebridge-mock-plugin',
      headers: {
        authorization,
      },
      payload: {},
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(0)
  })

  it('GET /config-editor/plugin/:pluginName (plugin not found)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/config-editor/plugin/homebridge-fake-example-plugin',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(404)
  })

  it('POST /config-editor/plugin/:pluginName', async () => {
    // Empty platforms
    const currentConfig: HomebridgeConfig = await readJson(configFilePath)
    currentConfig.platforms = []
    await writeJson(configFilePath, currentConfig)

    const mockConfig = [
      {
        platform: 'ExampleHomebridgePlugin',
      },
    ]

    const res = await app.inject({
      method: 'POST',
      path: '/config-editor/plugin/homebridge-mock-plugin',
      headers: {
        authorization,
      },
      payload: mockConfig,
    })

    expect(res.statusCode).toBe(201)

    const updatedConfig: HomebridgeConfig = await readJson(configFilePath)
    expect(updatedConfig.platforms).toHaveLength(1)
    expect(updatedConfig.platforms).toEqual(mockConfig)
  })

  it('POST /config-editor/plugin/:pluginName (retain index position)', async () => {
    // Empty platforms
    const currentConfig: HomebridgeConfig = await readJson(configFilePath)
    currentConfig.platforms = [
      {
        platform: 'not it 0 ',
      },
      {
        platform: 'not it 1',
      },
      {
        platform: 'ExampleHomebridgePlugin',
      },
      {
        platform: 'not it 3',
      },
    ]
    await writeJson(configFilePath, currentConfig)

    const mockConfig = [
      {
        platform: 'ExampleHomebridgePlugin',
      },
    ]

    const res = await app.inject({
      method: 'POST',
      path: '/config-editor/plugin/homebridge-mock-plugin',
      headers: {
        authorization,
      },
      payload: mockConfig,
    })

    expect(res.statusCode).toBe(201)

    const updatedConfig: HomebridgeConfig = await readJson(configFilePath)
    expect(updatedConfig.platforms).toHaveLength(4)
    expect(updatedConfig.platforms[2]).toEqual(mockConfig[0])
  })

  it('POST /config-editor/plugin/:pluginName (remove config)', async () => {
    // Empty platforms
    const currentConfig: HomebridgeConfig = await readJson(configFilePath)
    currentConfig.platforms = [
      {
        platform: 'not it 0 ',
      },
      {
        platform: 'not it 1',
      },
      {
        platform: 'ExampleHomebridgePlugin',
      },
      {
        platform: 'not it 3',
      },
    ]
    await writeJson(configFilePath, currentConfig)

    const mockConfig = []

    const res = await app.inject({
      method: 'POST',
      path: '/config-editor/plugin/homebridge-mock-plugin',
      headers: {
        authorization,
      },
      payload: mockConfig,
    })

    expect(res.statusCode).toBe(201)

    const updatedConfig: HomebridgeConfig = await readJson(configFilePath)
    expect(updatedConfig.platforms).toHaveLength(3)
  })

  it('POST /config-editor/plugin/:pluginName (set alias)', async () => {
    // Empty platforms
    const currentConfig: HomebridgeConfig = await readJson(configFilePath)
    currentConfig.platforms = []
    await writeJson(configFilePath, currentConfig)

    const mockConfig = [
      {
        name: 'test',
        testing: true,
      },
    ]

    const res = await app.inject({
      method: 'POST',
      path: '/config-editor/plugin/homebridge-mock-plugin',
      headers: {
        authorization,
      },
      payload: mockConfig,
    })

    expect(res.statusCode).toBe(201)

    const updatedConfig: HomebridgeConfig = await readJson(configFilePath)
    expect(updatedConfig.platforms).toHaveLength(1)
    expect(updatedConfig.platforms[0].platform).toBe('ExampleHomebridgePlugin')
  })

  it('POST /config-editor/plugin/:pluginName (enforce array body)', async () => {
    const mockConfig = {
      name: 'test',
      testing: true,
    }

    const res = await app.inject({
      method: 'POST',
      path: '/config-editor/plugin/homebridge-mock-plugin',
      headers: {
        authorization,
      },
      payload: mockConfig,
    })

    expect(res.statusCode).toBe(400)
    expect(res.body).toContain('Plugin Config must be an array.')
  })

  it('POST /config-editor/plugin/:pluginName (ensure block is object and not array)', async () => {
    const mockConfig = [
      [
        {
          name: 'test',
          testing: true,
        },
      ],
    ]

    const res = await app.inject({
      method: 'POST',
      path: '/config-editor/plugin/homebridge-mock-plugin',
      headers: {
        authorization,
      },
      payload: mockConfig,
    })

    expect(res.statusCode).toBe(400)
    expect(res.body).toContain('Plugin config must be an array of objects.')
  })

  it('PUT /config-editor/plugin/:pluginName/disable', async () => {
    const res = await app.inject({
      method: 'PUT',
      path: '/config-editor/plugin/homebridge-mock-plugin/disable',
      headers: {
        authorization,
      },
      payload: {},
    })

    expect(res.statusCode).toBe(200)

    const config: HomebridgeConfig = await readJson(configFilePath)
    expect(Array.isArray(config.disabledPlugins)).toBe(true)
    expect(config.disabledPlugins).toContainEqual('homebridge-mock-plugin')
  })

  it('PUT /config-editor/plugin/:pluginName/disable (self)', async () => {
    const res = await app.inject({
      method: 'PUT',
      path: '/config-editor/plugin/homebridge-config-ui-x/disable',
      headers: {
        authorization,
      },
      payload: {},
    })

    expect(res.statusCode).toBe(400)
  })

  it('PUT /config-editor/plugin/:pluginName/enable', async () => {
    const initialConfig: HomebridgeConfig = await readJson(configFilePath)
    initialConfig.disabledPlugins = [
      'homebridge-mock-plugin',
      'homebridge-example-plugin',
    ]
    await writeJson(configFilePath, initialConfig)

    const res = await app.inject({
      method: 'PUT',
      path: '/config-editor/plugin/homebridge-mock-plugin/enable',
      headers: {
        authorization,
      },
      payload: {},
    })

    expect(res.statusCode).toBe(200)

    const config: HomebridgeConfig = await readJson(configFilePath)
    expect(Array.isArray(config.disabledPlugins)).toBe(true)
    expect(config.disabledPlugins).toHaveLength(1)
    expect(config.disabledPlugins).not.toContainEqual('homebridge-mock-plugin')
    expect(config.disabledPlugins).toContainEqual('homebridge-example-plugin')
  })

  describe('?include=restart-info', () => {
    const mockBridges = [
      { plugin: 'homebridge-mock-plugin', username: '0E:AA:BB:CC:DD:EE', identifier: 'Living Room' },
      { plugin: 'homebridge-other-plugin', username: '0E:11:22:33:44:55', identifier: 'Kitchen' },
    ]

    beforeEach(() => {
      const childBridgesService = app.get(ChildBridgesService)
      vi.spyOn(childBridgesService, 'getChildBridges').mockResolvedValue(mockBridges as any)
    })

    it('POST /config-editor wraps the response with all child bridges', async () => {
      const currentConfig: HomebridgeConfig = await readJson(configFilePath)
      currentConfig.bridge.name = 'Restart Name'

      const res = await app.inject({
        method: 'POST',
        path: '/config-editor?include=restart-info',
        headers: {
          authorization,
        },
        payload: currentConfig,
      })

      expect(res.statusCode).toBe(201)
      const body = res.json()
      expect(body).toHaveProperty('config')
      expect(body).not.toHaveProperty('restartRequired')
      expect(body.config.bridge.name).toBe('Restart Name')
      expect(body.affectedBridges).toHaveLength(2)
    })

    it('POST /config-editor without include keeps the bare response shape (backward compat)', async () => {
      const currentConfig: HomebridgeConfig = await readJson(configFilePath)

      const res = await app.inject({
        method: 'POST',
        path: '/config-editor',
        headers: {
          authorization,
        },
        payload: currentConfig,
      })

      expect(res.statusCode).toBe(201)
      const body = res.json()
      expect(body).not.toHaveProperty('config')
      expect(body).not.toHaveProperty('restartRequired')
      expect(body).not.toHaveProperty('affectedBridges')
      // The plain response is the saved config itself
      expect(body).toHaveProperty('bridge')
    })

    it('POST /config-editor/plugin/:pluginName scopes affectedBridges to that plugin', async () => {
      const res = await app.inject({
        method: 'POST',
        path: '/config-editor/plugin/homebridge-mock-plugin?include=restart-info',
        headers: {
          authorization,
        },
        payload: [
          { platform: 'ExampleHomebridgePlugin', name: 'Updated Block' },
        ],
      })

      expect(res.statusCode).toBe(201)
      const body = res.json()
      expect(body.restartRequired).toBeUndefined()
      expect(body.affectedBridges).toHaveLength(1)
      expect(body.affectedBridges[0].plugin).toBe('homebridge-mock-plugin')
      expect(Array.isArray(body.config)).toBe(true)
    })

    it('PUT /config-editor/plugin/:pluginName/enable wraps the disabledPlugins array', async () => {
      const initialConfig: HomebridgeConfig = await readJson(configFilePath)
      initialConfig.disabledPlugins = ['homebridge-mock-plugin']
      await writeJson(configFilePath, initialConfig)

      const res = await app.inject({
        method: 'PUT',
        path: '/config-editor/plugin/homebridge-mock-plugin/enable?include=restart-info',
        headers: {
          authorization,
        },
        payload: {},
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.restartRequired).toBeUndefined()
      expect(body.affectedBridges).toHaveLength(1)
      expect(body.affectedBridges[0].plugin).toBe('homebridge-mock-plugin')
      expect(body.config).toEqual([])
    })

    it('PUT /config-editor/plugin/:pluginName/disable captures bridges before the mutation', async () => {
      const res = await app.inject({
        method: 'PUT',
        path: '/config-editor/plugin/homebridge-mock-plugin/disable?include=restart-info',
        headers: {
          authorization,
        },
        payload: {},
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.restartRequired).toBeUndefined()
      // The plugin's bridges must still be present in affectedBridges even though
      // the plugin is now disabled — captured from the pre-mutation snapshot.
      expect(body.affectedBridges).toHaveLength(1)
      expect(body.affectedBridges[0].plugin).toBe('homebridge-mock-plugin')
      expect(body.config).toContain('homebridge-mock-plugin')
    })

    it('POST /config-editor/plugin/:pluginName?include=restart-info still saves when IPC throws', async () => {
      const childBridgesService = app.get(ChildBridgesService)
      const spy = vi.spyOn(childBridgesService, 'getChildBridges').mockRejectedValue(new Error('IPC offline'))
      try {
        const res = await app.inject({
          method: 'POST',
          path: '/config-editor/plugin/homebridge-mock-plugin?include=restart-info',
          headers: { authorization },
          payload: [
            { platform: 'ExampleHomebridgePlugin', name: 'IPC-Failure Block' },
          ],
        })
        expect(res.statusCode).toBe(201)
        // affectedBridges is empty because the IPC fetch failed, but the
        // mutation still committed — without the wrapper guard the
        // endpoint would 500 and the disk write would be invisible.
        expect(res.json().affectedBridges).toEqual([])
        expect(Array.isArray(res.json().config)).toBe(true)
      } finally {
        spy.mockRestore()
      }
    })

    it('PUT /config-editor/plugin/:pluginName/enable?include=restart-info still saves when IPC throws', async () => {
      const initialConfig: HomebridgeConfig = await readJson(configFilePath)
      initialConfig.disabledPlugins = ['homebridge-mock-plugin']
      await writeJson(configFilePath, initialConfig)

      const childBridgesService = app.get(ChildBridgesService)
      const spy = vi.spyOn(childBridgesService, 'getChildBridges').mockRejectedValue(new Error('IPC offline'))
      try {
        const res = await app.inject({
          method: 'PUT',
          path: '/config-editor/plugin/homebridge-mock-plugin/enable?include=restart-info',
          headers: { authorization },
          payload: {},
        })
        expect(res.statusCode).toBe(200)
        expect(res.json().affectedBridges).toEqual([])
        expect(res.json().config).toEqual([])
      } finally {
        spy.mockRestore()
      }
    })

    it('PUT /config-editor/plugin/:pluginName/disable?include=restart-info still saves when IPC throws', async () => {
      const childBridgesService = app.get(ChildBridgesService)
      const spy = vi.spyOn(childBridgesService, 'getChildBridges').mockRejectedValue(new Error('IPC offline'))
      try {
        const res = await app.inject({
          method: 'PUT',
          path: '/config-editor/plugin/homebridge-mock-plugin/disable?include=restart-info',
          headers: { authorization },
          payload: {},
        })
        expect(res.statusCode).toBe(200)
        expect(res.json().affectedBridges).toEqual([])
        expect(res.json().config).toContain('homebridge-mock-plugin')
      } finally {
        spy.mockRestore()
      }
    })
  })

  it('GET /config-editor/backups', async () => {
    const backupCount = (await readdir(backupFilePath)).length

    const res = await app.inject({
      method: 'GET',
      path: '/config-editor/backups',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(backupCount)
  })

  it('GET /config-editor/backups (sorted newest first by numeric timestamp)', async () => {
    await ensureDir(backupFilePath)
    await emptyDir(backupFilePath)

    const timestamps = ['999999999', '1700000000000', '1500000000000', '100000000000']
    for (const ts of timestamps) {
      await writeFile(resolve(backupFilePath, `config.json.${ts}`), 'xyz')
    }

    const res = await app.inject({
      method: 'GET',
      path: '/config-editor/backups',
      headers: { authorization },
    })

    expect(res.statusCode).toBe(200)
    const ids = res.json().map((b: any) => b.id)
    expect(ids).toEqual(['1700000000000', '1500000000000', '100000000000', '999999999'])
  })

  it('GET /config-editor/backups/:backupId', async () => {
    const availableBackups = (await app.inject({
      method: 'GET',
      path: '/config-editor/backups',
      headers: {
        authorization,
      },
    })).json()

    expect(availableBackups.length).toBeGreaterThan(0)

    const res = await app.inject({
      method: 'GET',
      path: `/config-editor/backups/${availableBackups[0].id}`,
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
  })

  it('DELETE /config-editor/backups', async () => {
    const originalBackupCount = (await readdir(backupFilePath)).length
    expect(originalBackupCount).toBeGreaterThan(0)

    const res = await app.inject({
      method: 'DELETE',
      path: '/config-editor/backups',
      headers: {
        authorization,
      },
    })

    // There is a race condition here whereby we might read the backup file
    // Path before the deletion has actually happened, causing the test to fail,
    // So I have added a 1-second delay.
    await new Promise(r => setTimeout(r, 1000))

    const backups = await readdir(backupFilePath)
    const newBackupCount = backups.length

    expect(newBackupCount).toBe(0)
    expect(res.statusCode).toBe(200)
  })

  describe('PUT /config-editor/ui', () => {
    it('persists a single UI config property', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/config-editor/ui',
        headers: {
          authorization,
        },
        payload: {
          key: 'theme',
          value: 'red',
        },
      })

      expect(res.statusCode).toBe(200)

      const config: HomebridgeConfig = await readJson(configFilePath)
      const uiBlock = config.platforms.find((p: any) => p.platform === 'config')
      expect((uiBlock as any).theme).toBe('red')
    })

    it('supports dot notation for nested keys', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/config-editor/ui',
        headers: {
          authorization,
        },
        payload: {
          key: 'terminal.fontSize',
          value: 14,
        },
      })

      expect(res.statusCode).toBe(200)

      const config: HomebridgeConfig = await readJson(configFilePath)
      const uiBlock = config.platforms.find((p: any) => p.platform === 'config') as any
      expect(uiBlock.terminal.fontSize).toBe(14)
    })

    it('rejects updates to the platform property', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/config-editor/ui',
        headers: {
          authorization,
        },
        payload: {
          key: 'platform',
          value: 'something-else',
        },
      })

      expect(res.statusCode).toBe(400)
      expect(res.body).toContain('Cannot update the platform property.')
    })

    it('rejects an unsafe restart command on save', async () => {
      // ui.restart is admin-editable and used to run through /bin/sh —
      // a value with shell metacharacters could exec arbitrary code as
      // the Homebridge process user. The allowlist now refuses any
      // string that doesn't parse as `[sudo ...] <trusted-binary> [args]`.
      const res = await app.inject({
        method: 'PUT',
        url: '/config-editor/ui',
        headers: { authorization },
        payload: {
          key: 'restart',
          value: 'sudo systemctl restart homebridge; rm -rf /',
        },
      })

      expect(res.statusCode).toBe(400)
      expect(res.body).toContain('restart')

      // Sanity: a known-safe command of the same shape is allowed.
      const okRes = await app.inject({
        method: 'PUT',
        url: '/config-editor/ui',
        headers: { authorization },
        payload: {
          key: 'restart',
          value: 'sudo systemctl restart homebridge',
        },
      })
      expect(okRes.statusCode).toBe(200)
    })

    it('toggling scheduledBackupDisable re-registers the backup schedule', async () => {
      // The bug was: BackupService.scheduleInstanceBackups only ran once
      // at construction, so a user toggling this flag at runtime had to
      // restart the UI. The fix wires setPropertiesForUi to call
      // refreshBackupSchedule on the BackupService when the flag changes.
      const spy = vi.spyOn(backupService, 'scheduleInstanceBackups')
      spy.mockClear()

      try {
        const res = await app.inject({
          method: 'PUT',
          url: '/config-editor/ui',
          headers: { authorization },
          payload: {
            key: 'scheduledBackupDisable',
            value: true,
          },
        })

        expect(res.statusCode).toBe(200)
        expect(spy).toHaveBeenCalled()
      } finally {
        spy.mockRestore()
      }
    })
  })

  describe('PATCH /config-editor/ui', () => {
    it('applies multiple properties in a single write', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/config-editor/ui',
        headers: {
          authorization,
        },
        payload: {
          'theme': 'green',
          'lang': 'fr',
          'terminal.fontSize': 16,
        },
      })

      expect(res.statusCode).toBe(200)

      const config: HomebridgeConfig = await readJson(configFilePath)
      const uiBlock = config.platforms.find((p: any) => p.platform === 'config') as any
      expect(uiBlock.theme).toBe('green')
      expect(uiBlock.lang).toBe('fr')
      expect(uiBlock.terminal.fontSize).toBe(16)
    })

    it('rejects a batch that includes the platform key', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/config-editor/ui',
        headers: {
          authorization,
        },
        payload: {
          theme: 'blue',
          platform: 'something-else',
        },
      })

      expect(res.statusCode).toBe(400)
      expect(res.body).toContain('Cannot update the platform property.')

      // The whole batch must be rejected — theme should not have been written.
      const config: HomebridgeConfig = await readJson(configFilePath)
      const uiBlock = config.platforms.find((p: any) => p.platform === 'config') as any
      expect(uiBlock.theme).not.toBe('blue')
    })

    it('rejects forbidden prototype-chain keys', async () => {
      const before: HomebridgeConfig = await readJson(configFilePath)
      const beforeUi = before.platforms.find((p: any) => p.platform === 'config') as any
      const beforeTheme = beforeUi.theme

      const res = await app.inject({
        method: 'PATCH',
        url: '/config-editor/ui',
        headers: {
          authorization,
        },
        payload: {
          __proto__: 'hax',
          constructor: 'hax',
          prototype: 'hax',
          theme: 'orange',
        },
      })

      expect(res.statusCode).toBe(400)

      // Whole batch must be rejected — theme should not have been written.
      const config: HomebridgeConfig = await readJson(configFilePath)
      const uiBlock = config.platforms.find((p: any) => p.platform === 'config') as any
      expect(uiBlock.theme).toBe(beforeTheme)
    })

    it('rejects a dot-path that traverses a forbidden segment', async () => {
      const before: HomebridgeConfig = await readJson(configFilePath)
      const beforeUi = before.platforms.find((p: any) => p.platform === 'config') as any
      const beforeCleanup = beforeUi.cleanup

      const res = await app.inject({
        method: 'PATCH',
        url: '/config-editor/ui',
        headers: {
          authorization,
        },
        payload: {
          'cleanup.__proto__.hax': 'pwned',
        },
      })

      expect(res.statusCode).toBe(400)

      const after: HomebridgeConfig = await readJson(configFilePath)
      const afterUi = after.platforms.find((p: any) => p.platform === 'config') as any
      expect(afterUi.cleanup).toEqual(beforeCleanup)
      expect(afterUi.cleanup?.hax).toBeUndefined()
    })

    it('rejects a dot-path that traverses an inherited key', async () => {
      const before: HomebridgeConfig = await readJson(configFilePath)
      const beforeUi = before.platforms.find((p: any) => p.platform === 'config') as any

      const res = await app.inject({
        method: 'PATCH',
        url: '/config-editor/ui',
        headers: {
          authorization,
        },
        payload: {
          'toString. call': 'unhandled',
        },
      })

      expect(res.statusCode).toBe(400)

      const after: HomebridgeConfig = await readJson(configFilePath)
      const afterUi = after.platforms.find((p: any) => p.platform === 'config') as any
      expect(afterUi.toString).toBe(beforeUi.toString)
      expect(Object.hasOwn(afterUi, 'toString')).toBe(false)
    })

    it('two concurrent PATCH calls both persist their keys', async () => {
      // Without per-path serialisation in JsonFileStoreService, both calls
      // would read the same baseline and the second write would drop the
      // first call's key.
      const [a, b] = await Promise.all([
        app.inject({
          method: 'PATCH',
          url: '/config-editor/ui',
          headers: { authorization },
          payload: { 'parallelA.value': 1 },
        }),
        app.inject({
          method: 'PATCH',
          url: '/config-editor/ui',
          headers: { authorization },
          payload: { 'parallelB.value': 2 },
        }),
      ])
      expect(a.statusCode).toBe(200)
      expect(b.statusCode).toBe(200)

      const config: HomebridgeConfig = await readJson(configFilePath)
      const uiBlock = config.platforms.find((p: any) => p.platform === 'config') as any
      expect(uiBlock.parallelA?.value).toBe(1)
      expect(uiBlock.parallelB?.value).toBe(2)
    })

    it('no-ops on an empty body', async () => {
      const before: HomebridgeConfig = await readJson(configFilePath)

      const res = await app.inject({
        method: 'PATCH',
        url: '/config-editor/ui',
        headers: {
          authorization,
        },
        payload: {},
      })

      expect(res.statusCode).toBe(200)

      const after: HomebridgeConfig = await readJson(configFilePath)
      expect(after).toEqual(before)
    })

    it('returns 401 without an authorization token', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/config-editor/ui',
        payload: { theme: 'purple' },
      })

      expect(res.statusCode).toBe(401)
    })
  })

  it('GET/PUT /config-editor/ui/plugins/hide-updates-for (should handle hide updates functionality)', async () => {
    // Test 1: Should return empty array initially
    let res = await app.inject({
      method: 'GET',
      url: '/config-editor/ui/plugins/hide-updates-for',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    let result = res.json()
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(0)

    // Test 2: Should set hide updates list
    const testPlugins = ['homebridge-test-plugin', 'homebridge-another-plugin']

    res = await app.inject({
      method: 'PUT',
      url: '/config-editor/ui/plugins/hide-updates-for',
      headers: {
        authorization,
      },
      payload: {
        body: testPlugins,
      },
    })

    expect(res.statusCode).toBe(200)

    // Test 3: Should return the set plugins
    res = await app.inject({
      method: 'GET',
      url: '/config-editor/ui/plugins/hide-updates-for',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    result = res.json()
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(2)
    expect(result).toContain('homebridge-test-plugin')
    expect(result).toContain('homebridge-another-plugin')

    // Test 4: Should filter invalid plugin names
    const mixedPlugins = ['homebridge-valid-plugin', 'invalid-plugin', '', 'homebridge-another-valid']

    res = await app.inject({
      method: 'PUT',
      url: '/config-editor/ui/plugins/hide-updates-for',
      headers: {
        authorization,
      },
      payload: {
        body: mixedPlugins,
      },
    })

    expect(res.statusCode).toBe(200)

    // Check that only valid plugins were saved
    res = await app.inject({
      method: 'GET',
      url: '/config-editor/ui/plugins/hide-updates-for',
      headers: {
        authorization,
      },
    })

    result = res.json()
    expect(result.length).toBe(2)
    expect(result).toContain('homebridge-valid-plugin')
    expect(result).toContain('homebridge-another-valid')
    expect(result).not.toContain('invalid-plugin')
  })

  it('GET/PUT /config-editor/ui/plugins/hide-child-bridge-setup-for (should handle hide child-bridge-setup functionality)', async () => {
    // Test 1: Should return empty array initially
    let res = await app.inject({
      method: 'GET',
      url: '/config-editor/ui/plugins/hide-child-bridge-setup-for',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    let result = res.json()
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(0)

    // Test 2: Should set hide child-bridge-setup list
    const testPlugins = ['homebridge-test-plugin', 'homebridge-another-plugin']

    res = await app.inject({
      method: 'PUT',
      url: '/config-editor/ui/plugins/hide-child-bridge-setup-for',
      headers: {
        authorization,
      },
      payload: {
        body: testPlugins,
      },
    })

    expect(res.statusCode).toBe(200)

    // Test 3: Should return the set plugins
    res = await app.inject({
      method: 'GET',
      url: '/config-editor/ui/plugins/hide-child-bridge-setup-for',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    result = res.json()
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(2)
    expect(result).toContain('homebridge-test-plugin')
    expect(result).toContain('homebridge-another-plugin')

    // Test 4: Should filter invalid plugin names
    const mixedPlugins = ['homebridge-valid-plugin', 'invalid-plugin', '', 'homebridge-another-valid']

    res = await app.inject({
      method: 'PUT',
      url: '/config-editor/ui/plugins/hide-child-bridge-setup-for',
      headers: {
        authorization,
      },
      payload: {
        body: mixedPlugins,
      },
    })

    expect(res.statusCode).toBe(200)

    res = await app.inject({
      method: 'GET',
      url: '/config-editor/ui/plugins/hide-child-bridge-setup-for',
      headers: {
        authorization,
      },
    })

    result = res.json()
    expect(result.length).toBe(2)
    expect(result).toContain('homebridge-valid-plugin')
    expect(result).toContain('homebridge-another-valid')
    expect(result).not.toContain('invalid-plugin')

    // Test 5: Empty list should remove the key from config.json (via cleanUpUiConfig)
    res = await app.inject({
      method: 'PUT',
      url: '/config-editor/ui/plugins/hide-child-bridge-setup-for',
      headers: {
        authorization,
      },
      payload: {
        body: [],
      },
    })

    expect(res.statusCode).toBe(200)

    res = await app.inject({
      method: 'GET',
      url: '/config-editor/ui/plugins/hide-child-bridge-setup-for',
      headers: {
        authorization,
      },
    })

    result = res.json()
    expect(result.length).toBe(0)
  })

  it('GET/PUT /config-editor/ui/bridges/:username (should handle bridge configuration)', async () => {
    const testUsername1 = '67:E4:1F:0E:A0:5D'
    const testUsername2 = '0E:02:9A:9D:44:45'

    // Test 1: Should return object with false values for non-existent bridge
    let res = await app.inject({
      method: 'GET',
      url: `/config-editor/ui/bridges/${testUsername1}`,
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    let result = res.json()
    expect(result).toBeTruthy()
    expect(result.username).toBe(testUsername1)
    expect(result.hideHapAlert).toBe(false)
    expect(result.hideMatterAlert).toBe(false)
    expect(result.scheduledRestartCron).toBe(null)

    // Test 2: Should set hideHapAlert for bridge
    res = await app.inject({
      method: 'PUT',
      url: `/config-editor/ui/bridges/${testUsername1}/hide-hap-alert`,
      headers: {
        authorization,
      },
      payload: {
        value: true,
      },
    })

    expect(res.statusCode).toBe(200)

    // Test 3: Should return bridge with hideHapAlert set
    res = await app.inject({
      method: 'GET',
      url: `/config-editor/ui/bridges/${testUsername1}`,
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    result = res.json()
    expect(result).toBeTruthy()
    expect(result.username).toBe(testUsername1)
    expect(result.hideHapAlert).toBe(true)
    expect(result.hideMatterAlert).toBe(false)

    // Test 4: Should set hideMatterAlert for same bridge (merging properties)
    res = await app.inject({
      method: 'PUT',
      url: `/config-editor/ui/bridges/${testUsername1}/hide-matter-alert`,
      headers: {
        authorization,
      },
      payload: {
        value: true,
      },
    })

    expect(res.statusCode).toBe(200)

    // Test 5: Should return bridge with both flags set
    res = await app.inject({
      method: 'GET',
      url: `/config-editor/ui/bridges/${testUsername1}`,
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    result = res.json()
    expect(result.username).toBe(testUsername1)
    expect(result.hideHapAlert).toBe(true)
    expect(result.hideMatterAlert).toBe(true)

    // Test 6: Should set hideMatterAlert for different bridge
    res = await app.inject({
      method: 'PUT',
      url: `/config-editor/ui/bridges/${testUsername2}/hide-matter-alert`,
      headers: {
        authorization,
      },
      payload: {
        value: true,
      },
    })

    expect(res.statusCode).toBe(200)

    // Test 7: Should return second bridge with only hideMatterAlert
    res = await app.inject({
      method: 'GET',
      url: `/config-editor/ui/bridges/${testUsername2}`,
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    result = res.json()
    expect(result.username).toBe(testUsername2)
    expect(result.hideHapAlert).toBe(false)
    expect(result.hideMatterAlert).toBe(true)

    // Test 8: Should unset hideHapAlert
    res = await app.inject({
      method: 'PUT',
      url: `/config-editor/ui/bridges/${testUsername1}/hide-hap-alert`,
      headers: {
        authorization,
      },
      payload: {
        value: false,
      },
    })

    expect(res.statusCode).toBe(200)

    // Test 9: Should return bridge with only hideMatterAlert now
    res = await app.inject({
      method: 'GET',
      url: `/config-editor/ui/bridges/${testUsername1}`,
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    result = res.json()
    expect(result.username).toBe(testUsername1)
    expect(result.hideHapAlert).toBe(false)
    expect(result.hideMatterAlert).toBe(true)

    // Test 10: Should handle invalid username formats
    res = await app.inject({
      method: 'GET',
      url: '/config-editor/ui/bridges/invalid-mac',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toBeNull()
  })

  it('GET /config-editor/matter (should return null when not configured)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/config-editor/matter',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toBe(null)
  })

  it('PUT /config-editor/matter (should save valid Matter config)', async () => {
    const matterConfig = {
      port: 5540,
    }

    const res = await app.inject({
      method: 'PUT',
      path: '/config-editor/matter',
      headers: {
        authorization,
      },
      payload: matterConfig,
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual(matterConfig)

    // Verify it was saved to config.json
    const config: HomebridgeConfig = await readJson(configFilePath)
    expect(config.bridge.matter).toEqual(matterConfig)
  })

  it('GET /config-editor/matter (should return config when configured)', async () => {
    // First set a config
    const matterConfig = {
      port: 5535,
    }

    await app.inject({
      method: 'PUT',
      path: '/config-editor/matter',
      headers: {
        authorization,
      },
      payload: matterConfig,
    })

    // Then get it
    const res = await app.inject({
      method: 'GET',
      path: '/config-editor/matter',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual(matterConfig)
  })

  it('PUT /config-editor/matter (should reject invalid port - too low)', async () => {
    const matterConfig = {
      port: 1000,
    }

    const res = await app.inject({
      method: 'PUT',
      path: '/config-editor/matter',
      headers: {
        authorization,
      },
      payload: matterConfig,
    })

    expect(res.statusCode).toBe(400)
    expect(res.body).toContain('Port must be an integer between 1024 and 65535')
  })

  it('PUT /config-editor/matter (should reject invalid port - too high)', async () => {
    const matterConfig = {
      port: 70000,
    }

    const res = await app.inject({
      method: 'PUT',
      path: '/config-editor/matter',
      headers: {
        authorization,
      },
      payload: matterConfig,
    })

    expect(res.statusCode).toBe(400)
    expect(res.body).toContain('Port must be an integer between 1024 and 65535')
  })

  it('PUT /config-editor/matter (should reject reserved ports)', async () => {
    const reservedPorts = [5353, 8080, 8443]

    for (const port of reservedPorts) {
      const res = await app.inject({
        method: 'PUT',
        path: '/config-editor/matter',
        headers: {
          authorization,
        },
        payload: {
          port,
        },
      })

      expect(res.statusCode).toBe(400)
      expect(res.body).toContain('reserved and cannot be used')
    }
  })

  it('PUT /config-editor/matter (should reject non-integer port)', async () => {
    const matterConfig = {
      port: 5540.5,
    }

    const res = await app.inject({
      method: 'PUT',
      path: '/config-editor/matter',
      headers: {
        authorization,
      },
      payload: matterConfig,
    })

    expect(res.statusCode).toBe(400)
    expect(res.body).toContain('Port must be an integer')
  })

  it('PUT /config-editor/matter (should accept empty config object)', async () => {
    const matterConfig = {}

    const res = await app.inject({
      method: 'PUT',
      path: '/config-editor/matter',
      headers: {
        authorization,
      },
      payload: matterConfig,
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual(matterConfig)

    // Verify it was saved to config.json
    const config: HomebridgeConfig = await readJson(configFilePath)
    expect(config.bridge.matter).toEqual(matterConfig)
  })

  it('PUT /config-editor/matter/enabled (should disable Matter in place, preserving the block + port)', async () => {
    // Configure Matter first
    await app.inject({
      method: 'PUT',
      path: '/config-editor/matter',
      headers: { authorization },
      payload: { port: 5540 },
    })

    const res = await app.inject({
      method: 'PUT',
      path: '/config-editor/matter/enabled',
      headers: { authorization },
      payload: { enabled: false },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ enabled: false, externalsOnly: false })

    // The block and port are preserved; only `enabled: false` is added (no teardown)
    const config: HomebridgeConfig = await readJson(configFilePath)
    expect(config.bridge.matter).toEqual({ port: 5540, enabled: false })
  })

  it('PUT /config-editor/matter/enabled (should re-enable Matter by clearing the flag)', async () => {
    // Pre-seed a disabled-in-place Matter block
    const seed: HomebridgeConfig = await readJson(configFilePath)
    seed.bridge.matter = { port: 5540, enabled: false }
    await writeJson(configFilePath, seed)

    const res = await app.inject({
      method: 'PUT',
      path: '/config-editor/matter/enabled',
      headers: { authorization },
      payload: { enabled: true },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ enabled: true, externalsOnly: false })

    // The `enabled` flag is removed (present-without-flag means enabled); port kept
    const config: HomebridgeConfig = await readJson(configFilePath)
    expect(config.bridge.matter).toEqual({ port: 5540 })
  })

  it('PUT /config-editor/matter/enabled (should also clear externalsOnly when re-enabling)', async () => {
    // Pre-seed: matter disabled in place + externalsOnly set. Even though the
    // mock homebridge version has the protocolExternalsOnly flag off (writes
    // wouldn't produce this shape), the reader and re-enable path tolerate it.
    const seed: HomebridgeConfig = await readJson(configFilePath)
    seed.bridge.matter = { port: 5540, enabled: false, externalsOnly: true } as any
    await writeJson(configFilePath, seed)

    const res = await app.inject({
      method: 'PUT',
      path: '/config-editor/matter/enabled',
      headers: { authorization },
      payload: { enabled: true },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ enabled: true, externalsOnly: false })

    // externalsOnly must be cleared too (validation would reject enabled + externalsOnly).
    const config: HomebridgeConfig = await readJson(configFilePath)
    expect(config.bridge.matter).toEqual({ port: 5540 })
  })

  it('PUT /config-editor/matter/enabled (should reject when Matter is not configured)', async () => {
    // Default config has no bridge.matter
    const res = await app.inject({
      method: 'PUT',
      path: '/config-editor/matter/enabled',
      headers: { authorization },
      payload: { enabled: false },
    })

    expect(res.statusCode).toBe(400)
    expect(res.body).toContain('Matter is not configured')
  })

  it('GET /config-editor/hap (should return enabled=true when bridge.hap is unset)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/config-editor/hap',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ enabled: true, externalsOnly: false, disableIdentifyingMaterial: false })
  })

  it('GET /config-editor/hap (should return enabled=false when bridge.hap=false, legacy boolean form)', async () => {
    // Pre-seed config with bridge.hap=false (and matter configured so it's a valid state)
    const config: HomebridgeConfig = await readJson(configFilePath)
    ;(config.bridge as any).hap = false
    config.bridge.matter = { port: 5540 }
    await writeJson(configFilePath, config)

    const res = await app.inject({
      method: 'GET',
      path: '/config-editor/hap',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ enabled: false, externalsOnly: false, disableIdentifyingMaterial: false })
  })

  it('GET /config-editor/hap (should return enabled=true when bridge.hap=true explicitly)', async () => {
    const config: HomebridgeConfig = await readJson(configFilePath)
    ;(config.bridge as any).hap = true
    await writeJson(configFilePath, config)

    const res = await app.inject({
      method: 'GET',
      path: '/config-editor/hap',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ enabled: true, externalsOnly: false, disableIdentifyingMaterial: false })
  })

  it('GET /config-editor/hap (should return enabled=false when bridge.hap is the nested object form)', async () => {
    // The new homebridge runtime (>= 2.0.3-beta.26) writes the nested object
    // form. The reader tolerates this even when the feature flag is off.
    const config: HomebridgeConfig = await readJson(configFilePath)
    ;(config.bridge as any).hap = { enabled: false }
    config.bridge.matter = { port: 5540 }
    await writeJson(configFilePath, config)

    const res = await app.inject({
      method: 'GET',
      path: '/config-editor/hap',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ enabled: false, externalsOnly: false, disableIdentifyingMaterial: false })
  })

  it('GET /config-editor/hap (should surface externalsOnly:true when set in the nested form)', async () => {
    const config: HomebridgeConfig = await readJson(configFilePath)
    ;(config.bridge as any).hap = { enabled: false, externalsOnly: true }
    await writeJson(configFilePath, config)

    const res = await app.inject({
      method: 'GET',
      path: '/config-editor/hap',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ enabled: false, externalsOnly: true, disableIdentifyingMaterial: false })
  })

  it('GET /config-editor/hap (should surface disableIdentifyingMaterial:true when set)', async () => {
    const config: HomebridgeConfig = await readJson(configFilePath)
    config.bridge.hap = { disableIdentifyingMaterial: true }
    await writeJson(configFilePath, config)

    const res = await app.inject({
      method: 'GET',
      path: '/config-editor/hap',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ enabled: true, externalsOnly: false, disableIdentifyingMaterial: true })
  })

  it('GET /config-editor/hap (should treat an empty hap object as enabled)', async () => {
    const config: HomebridgeConfig = await readJson(configFilePath)
    ;(config.bridge as any).hap = {}
    await writeJson(configFilePath, config)

    const res = await app.inject({
      method: 'GET',
      path: '/config-editor/hap',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ enabled: true, externalsOnly: false, disableIdentifyingMaterial: false })
  })

  it('PUT /config-editor/hap (should allow disabling HAP even when Matter is not configured)', async () => {
    // Default config has no bridge.matter. Disabling HAP here leaves the main
    // bridge with no protocols enabled — this is now allowed; the bridge simply
    // advertises nothing.
    const res = await app.inject({
      method: 'PUT',
      path: '/config-editor/hap',
      headers: {
        authorization,
      },
      payload: { enabled: false },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ enabled: false, externalsOnly: false, disableIdentifyingMaterial: false })

    // bridge.hap should be persisted as false (legacy form on the older mock
    // homebridge version that doesn't have the protocolExternalsOnly flag).
    const config: HomebridgeConfig = await readJson(configFilePath)
    expect(config.bridge.hap).toBe(false)
    expect(config.bridge.matter).toBeUndefined()
  })

  it('PUT /config-editor/hap (should persist bridge.hap=false when Matter is configured)', async () => {
    // Configure Matter first so disabling HAP is valid
    await app.inject({
      method: 'PUT',
      path: '/config-editor/matter',
      headers: {
        authorization,
      },
      payload: { port: 5540 },
    })

    const res = await app.inject({
      method: 'PUT',
      path: '/config-editor/hap',
      headers: {
        authorization,
      },
      payload: { enabled: false },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ enabled: false, externalsOnly: false, disableIdentifyingMaterial: false })

    const config: HomebridgeConfig = await readJson(configFilePath)
    expect(config.bridge.hap).toBe(false)
    expect(config.bridge.matter).toEqual({ port: 5540 })
  })

  it('PUT /config-editor/hap (should delete the hap property when re-enabling)', async () => {
    // Pre-seed: HAP disabled (legacy boolean form), Matter configured
    const config: HomebridgeConfig = await readJson(configFilePath)
    ;(config.bridge as any).hap = false
    config.bridge.matter = { port: 5540 }
    await writeJson(configFilePath, config)

    const res = await app.inject({
      method: 'PUT',
      path: '/config-editor/hap',
      headers: {
        authorization,
      },
      payload: { enabled: true },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ enabled: true, externalsOnly: false, disableIdentifyingMaterial: false })

    // hap property should be removed (HAP enabled is the default — omit when on)
    const updated: HomebridgeConfig = await readJson(configFilePath)
    expect(updated.bridge.hap).toBeUndefined()
  })

  it('PUT /config-editor/hap (should also delete the nested hap object when re-enabling)', async () => {
    // Pre-seed: nested form with enabled: false + externalsOnly: true
    const config: HomebridgeConfig = await readJson(configFilePath)
    ;(config.bridge as any).hap = { enabled: false, externalsOnly: true }
    await writeJson(configFilePath, config)

    const res = await app.inject({
      method: 'PUT',
      path: '/config-editor/hap',
      headers: {
        authorization,
      },
      payload: { enabled: true },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ enabled: true, externalsOnly: false, disableIdentifyingMaterial: false })

    // The whole property is dropped — externalsOnly: true cannot coexist with enabled: true.
    const updated: HomebridgeConfig = await readJson(configFilePath)
    expect(updated.bridge.hap).toBeUndefined()
  })

  it('PUT /config-editor/hap (should be a no-op when enabling and already enabled)', async () => {
    // Default state: bridge.hap unset (i.e. enabled by default)
    const before: HomebridgeConfig = await readJson(configFilePath)
    expect(before.bridge.hap).toBeUndefined()

    const res = await app.inject({
      method: 'PUT',
      path: '/config-editor/hap',
      headers: {
        authorization,
      },
      payload: { enabled: true },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ enabled: true, externalsOnly: false, disableIdentifyingMaterial: false })

    const after: HomebridgeConfig = await readJson(configFilePath)
    expect(after.bridge.hap).toBeUndefined()
  })

  it('should enable the hapDisableIdentifyingMaterial feature flag from Homebridge 2.2.2-beta.0', () => {
    homebridgeConfigService.homebridgeVersion = '2.2.1'
    expect(homebridgeConfigService.getFeatureFlags().hapDisableIdentifyingMaterial).toBe(false)

    homebridgeConfigService.homebridgeVersion = '2.2.2-beta.0'
    expect(homebridgeConfigService.getFeatureFlags().hapDisableIdentifyingMaterial).toBe(true)

    homebridgeConfigService.homebridgeVersion = '2.3.0'
    expect(homebridgeConfigService.getFeatureFlags().hapDisableIdentifyingMaterial).toBe(true)
  })

  it('PUT /config-editor/hap (should persist and preserve disableIdentifyingMaterial)', async () => {
    homebridgeConfigService.homebridgeVersion = '2.2.2-beta.0'

    let res = await app.inject({
      method: 'PUT',
      path: '/config-editor/hap',
      headers: { authorization },
      payload: { enabled: true, disableIdentifyingMaterial: true, restart: false },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ enabled: true, externalsOnly: false, disableIdentifyingMaterial: true })
    let config: HomebridgeConfig = await readJson(configFilePath)
    expect(config.bridge.hap).toEqual({ disableIdentifyingMaterial: true })

    // Older UI clients omit the new field when toggling HAP. Preserve the
    // configured preference across both transitions.
    res = await app.inject({
      method: 'PUT',
      path: '/config-editor/hap',
      headers: { authorization },
      payload: { enabled: false, restart: false },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ enabled: false, externalsOnly: false, disableIdentifyingMaterial: true })
    config = await readJson(configFilePath)
    expect(config.bridge.hap).toEqual({ enabled: false, disableIdentifyingMaterial: true })

    res = await app.inject({
      method: 'PUT',
      path: '/config-editor/hap',
      headers: { authorization },
      payload: { enabled: true, restart: false },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ enabled: true, externalsOnly: false, disableIdentifyingMaterial: true })
    config = await readJson(configFilePath)
    expect(config.bridge.hap).toEqual({ disableIdentifyingMaterial: true })

    res = await app.inject({
      method: 'PUT',
      path: '/config-editor/hap',
      headers: { authorization },
      payload: { enabled: true, disableIdentifyingMaterial: false, restart: false },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ enabled: true, externalsOnly: false, disableIdentifyingMaterial: false })
    config = await readJson(configFilePath)
    expect(config.bridge.hap).toBeUndefined()
  })

  it('PUT /config-editor/hap (should reject non-boolean disableIdentifyingMaterial)', async () => {
    homebridgeConfigService.homebridgeVersion = '2.2.2-beta.0'

    const res = await app.inject({
      method: 'PUT',
      path: '/config-editor/hap',
      headers: { authorization },
      payload: { enabled: true, disableIdentifyingMaterial: 'yes', restart: false },
    })

    expect(res.statusCode).toBe(400)
    expect(res.body).toContain('disableIdentifyingMaterial must be a boolean')
  })

  it('GET/PUT /config-editor/ui/bridges/:username/scheduled-restart-cron (should handle scheduled restart cron)', async () => {
    const testUsername1 = '67:E4:1F:0E:A0:5D'
    const testUsername2 = '0E:02:9A:9D:44:45'

    // Test 1: Should set scheduledRestartCron for bridge
    let res = await app.inject({
      method: 'PUT',
      url: `/config-editor/ui/bridges/${testUsername1}/scheduled-restart-cron`,
      headers: {
        authorization,
      },
      payload: {
        value: '0 5 * * *',
      },
    })

    expect(res.statusCode).toBe(200)

    // Test 2: Should return bridge with scheduledRestartCron set
    res = await app.inject({
      method: 'GET',
      url: `/config-editor/ui/bridges/${testUsername1}`,
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    let result = res.json()
    expect(result).toBeTruthy()
    expect(result.username).toBe(testUsername1)
    expect(result.scheduledRestartCron).toBe('0 5 * * *')

    // Test 3: Should update scheduledRestartCron to different value
    res = await app.inject({
      method: 'PUT',
      url: `/config-editor/ui/bridges/${testUsername1}/scheduled-restart-cron`,
      headers: {
        authorization,
      },
      payload: {
        value: '0 3 * * 1',
      },
    })

    expect(res.statusCode).toBe(200)

    // Verify it was updated
    res = await app.inject({
      method: 'GET',
      url: `/config-editor/ui/bridges/${testUsername1}`,
      headers: {
        authorization,
      },
    })

    result = res.json()
    expect(result.scheduledRestartCron).toBe('0 3 * * 1')

    // Test 4: Should remove scheduledRestartCron when set to null
    res = await app.inject({
      method: 'PUT',
      url: `/config-editor/ui/bridges/${testUsername1}/scheduled-restart-cron`,
      headers: {
        authorization,
      },
      payload: {
        value: null,
      },
    })

    expect(res.statusCode).toBe(200)

    // Verify it was removed
    res = await app.inject({
      method: 'GET',
      url: `/config-editor/ui/bridges/${testUsername1}`,
      headers: {
        authorization,
      },
    })

    result = res.json()
    expect(result.scheduledRestartCron).toBe(null)

    // Test 5: Should remove scheduledRestartCron when set to empty string
    // First set it
    await app.inject({
      method: 'PUT',
      url: `/config-editor/ui/bridges/${testUsername1}/scheduled-restart-cron`,
      headers: {
        authorization,
      },
      payload: {
        value: '0 5 * * *',
      },
    })

    // Then remove with empty string
    res = await app.inject({
      method: 'PUT',
      url: `/config-editor/ui/bridges/${testUsername1}/scheduled-restart-cron`,
      headers: {
        authorization,
      },
      payload: {
        value: '',
      },
    })

    expect(res.statusCode).toBe(200)

    // Verify it was removed
    res = await app.inject({
      method: 'GET',
      url: `/config-editor/ui/bridges/${testUsername1}`,
      headers: {
        authorization,
      },
    })

    result = res.json()
    expect(result.scheduledRestartCron).toBe(null)

    // Test 6: Should set scheduledRestartCron for different bridge
    res = await app.inject({
      method: 'PUT',
      url: `/config-editor/ui/bridges/${testUsername2}/scheduled-restart-cron`,
      headers: {
        authorization,
      },
      payload: {
        value: '0 2 * * *',
      },
    })

    expect(res.statusCode).toBe(200)

    // Test 7: Should return second bridge with its own scheduledRestartCron
    res = await app.inject({
      method: 'GET',
      url: `/config-editor/ui/bridges/${testUsername2}`,
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    result = res.json()
    expect(result.username).toBe(testUsername2)
    expect(result.scheduledRestartCron).toBe('0 2 * * *')

    // Test 8: Should handle invalid username formats
    res = await app.inject({
      method: 'PUT',
      url: '/config-editor/ui/bridges/invalid-mac/scheduled-restart-cron',
      headers: {
        authorization,
      },
      payload: {
        value: '0 5 * * *',
      },
    })

    expect(res.statusCode).toBe(404)
  })

  it('PUT /config-editor/ui (should handle scheduled restart cron for main bridge)', async () => {
    // Test 1: Should set scheduledRestartCron for main bridge
    let res = await app.inject({
      method: 'PUT',
      url: '/config-editor/ui',
      headers: {
        authorization,
      },
      payload: {
        key: 'scheduledRestartCron',
        value: '0 4 * * *',
      },
    })

    expect(res.statusCode).toBe(200)

    // Verify it was saved to config.json
    let config: HomebridgeConfig = await readJson(configFilePath)
    const uiPlatform = config.platforms.find(p => p.platform === 'config')
    expect(uiPlatform).toBeTruthy()
    expect(uiPlatform.scheduledRestartCron).toBe('0 4 * * *')

    // Test 2: Should update scheduledRestartCron to different value
    res = await app.inject({
      method: 'PUT',
      url: '/config-editor/ui',
      headers: {
        authorization,
      },
      payload: {
        key: 'scheduledRestartCron',
        value: '0 6 * * *',
      },
    })

    expect(res.statusCode).toBe(200)

    config = await readJson(configFilePath)
    const uiPlatform2 = config.platforms.find(p => p.platform === 'config')
    expect(uiPlatform2.scheduledRestartCron).toBe('0 6 * * *')

    // Test 3: Should remove scheduledRestartCron when set to null
    res = await app.inject({
      method: 'PUT',
      url: '/config-editor/ui',
      headers: {
        authorization,
      },
      payload: {
        key: 'scheduledRestartCron',
        value: null,
      },
    })

    expect(res.statusCode).toBe(200)

    config = await readJson(configFilePath)
    const uiPlatform3 = config.platforms.find(p => p.platform === 'config')
    expect(uiPlatform3.scheduledRestartCron).toBeUndefined()

    // Test 4: Should remove scheduledRestartCron when set to empty string
    // First set it
    await app.inject({
      method: 'PUT',
      url: '/config-editor/ui',
      headers: {
        authorization,
      },
      payload: {
        key: 'scheduledRestartCron',
        value: '0 5 * * *',
      },
    })

    // Then remove with empty string
    res = await app.inject({
      method: 'PUT',
      url: '/config-editor/ui',
      headers: {
        authorization,
      },
      payload: {
        key: 'scheduledRestartCron',
        value: '',
      },
    })

    expect(res.statusCode).toBe(200)

    config = await readJson(configFilePath)
    const uiPlatform4 = config.platforms.find(p => p.platform === 'config')
    expect(uiPlatform4.scheduledRestartCron).toBeUndefined()
  })

  it('DELETE /config-editor/matter (should remove Matter config and storage)', async () => {
    // First set a Matter config
    await app.inject({
      method: 'PUT',
      path: '/config-editor/matter',
      headers: {
        authorization,
      },
      payload: {
        port: 5540,
      },
    })

    // Create mock Matter storage directory
    const matterStoragePath = resolve(process.env.UIX_STORAGE_PATH, 'matter', '67E41F0EA05D')
    await ensureDir(matterStoragePath)
    await writeJson(resolve(matterStoragePath, 'test.json'), { test: true })

    // Verify it exists
    expect(await pathExists(matterStoragePath)).toBe(true)

    // Delete the Matter config
    const res = await app.inject({
      method: 'DELETE',
      path: '/config-editor/matter',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)

    // Verify config was removed from config.json
    const config: HomebridgeConfig = await readJson(configFilePath)
    expect(config.bridge.matter).toBeUndefined()

    // Verify storage directory was removed
    expect(await pathExists(matterStoragePath)).toBe(false)

    // Verify GET returns null again
    const getRes = await app.inject({
      method: 'GET',
      path: '/config-editor/matter',
      headers: {
        authorization,
      },
    })

    expect(getRes.statusCode).toBe(200)
    expect(getRes.json()).toBe(null)
  })

  it('GET /config-editor/matter/ports (should return empty when not configured)', async () => {
    // Ensure no matterPorts in config
    const config: HomebridgeConfig = await readJson(configFilePath)
    delete config.matterPorts
    await writeJson(configFilePath, config)

    const res = await app.inject({
      method: 'GET',
      path: '/config-editor/matter/ports',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().start).toBeUndefined()
    expect(res.json().end).toBeUndefined()
  })

  it('PUT /config-editor/matter/ports (should save and return valid port range)', async () => {
    const putRes = await app.inject({
      method: 'PUT',
      path: '/config-editor/matter/ports',
      headers: {
        authorization,
      },
      payload: {
        start: 5530,
        end: 5541,
      },
    })

    expect(putRes.statusCode).toBe(200)

    const config: HomebridgeConfig = await readJson(configFilePath)
    expect(config.matterPorts.start).toBe(5530)
    expect(config.matterPorts.end).toBe(5541)

    // Verify GET returns the saved values
    const getRes = await app.inject({
      method: 'GET',
      path: '/config-editor/matter/ports',
      headers: {
        authorization,
      },
    })

    expect(getRes.statusCode).toBe(200)
    expect(getRes.json().start).toBe(5530)
    expect(getRes.json().end).toBe(5541)
  })

  it('PUT /config-editor/matter/ports (should reject start >= end)', async () => {
    const res = await app.inject({
      method: 'PUT',
      path: '/config-editor/matter/ports',
      headers: {
        authorization,
      },
      payload: {
        start: 5541,
        end: 5530,
      },
    })

    expect(res.statusCode).toBe(400)
  })

  it('PUT /config-editor/matter/ports (should reject port out of range)', async () => {
    const res = await app.inject({
      method: 'PUT',
      path: '/config-editor/matter/ports',
      headers: {
        authorization,
      },
      payload: {
        start: 100,
        end: 5541,
      },
    })

    expect(res.statusCode).toBe(400)
  })

  it('PUT /config-editor/matter/ports (should reject port above max)', async () => {
    const res = await app.inject({
      method: 'PUT',
      path: '/config-editor/matter/ports',
      headers: {
        authorization,
      },
      payload: {
        start: 5530,
        end: 70000,
      },
    })

    expect(res.statusCode).toBe(400)
  })

  it('PUT /config-editor/matter/ports (should clear when both null)', async () => {
    // First set a port range
    await app.inject({
      method: 'PUT',
      path: '/config-editor/matter/ports',
      headers: { authorization },
      payload: { start: 5530, end: 5541 },
    })

    // Now clear it
    const res = await app.inject({
      method: 'PUT',
      path: '/config-editor/matter/ports',
      headers: {
        authorization,
      },
      payload: {},
    })

    expect(res.statusCode).toBe(200)

    const config: HomebridgeConfig = await readJson(configFilePath)
    expect(config.matterPorts).toBeUndefined()
  })

  it('should refresh restart schedules from config', async () => {
    // Cancel any existing restart jobs first
    Object.keys(schedulerService.scheduledJobs)
      .filter(name => name.startsWith('restart-'))
      .forEach(name => schedulerService.cancelJob(name))

    // Set up a config with scheduled restart crons
    const configService = app.get(ConfigService)
    configService.ui.scheduledRestartCron = '0 3 * * *'
    configService.ui.bridges = [
      { username: '0E:AA:BB:CC:DD:EE', scheduledRestartCron: '0 4 * * *' },
    ]

    const config: HomebridgeConfig = {
      bridge: configService.homebridgeConfig.bridge,
      platforms: [
        {
          platform: 'ExamplePlugin',
          name: 'Test Plugin',
          _bridge: {
            username: '0E:AA:BB:CC:DD:EE',
            port: 45678,
          },
        },
      ],
    }

    await schedulerService.refreshRestartSchedules(config)

    // Check that the main bridge restart job was created
    expect(schedulerService.scheduledJobs).toHaveProperty('restart-homebridge')

    // Check child bridge restart job
    expect(schedulerService.scheduledJobs).toHaveProperty('restart-child-0EAABBCCDDEE')

    // Clean up
    schedulerService.cancelJob('restart-homebridge')
    schedulerService.cancelJob('restart-child-0EAABBCCDDEE')
    delete configService.ui.scheduledRestartCron
    delete configService.ui.bridges
  })

  it('should handle refreshRestartSchedules with no cron configured', async () => {
    // Cancel any existing restart jobs
    Object.keys(schedulerService.scheduledJobs)
      .filter(name => name.startsWith('restart-'))
      .forEach(name => schedulerService.cancelJob(name))

    // Reset to default config (no cron)
    await copy(resolve(__dirname, '../mocks', 'config.json'), configFilePath)

    await schedulerService.refreshRestartSchedules()

    // No restart jobs should be scheduled
    const restartJobs = Object.keys(schedulerService.scheduledJobs).filter(name => name.startsWith('restart-'))
    expect(restartJobs).toHaveLength(0)
  })

  it('DELETE /config-editor/backups/:backupId (should delete specific backup)', async () => {
    // First ensure we have backups by triggering a config save
    await app.inject({
      method: 'POST',
      path: '/config-editor',
      headers: { authorization },
      payload: await readJson(configFilePath),
    })

    // List backups
    const listRes = await app.inject({
      method: 'GET',
      path: '/config-editor/backups',
      headers: { authorization },
    })

    const backups = listRes.json()
    if (backups.length === 0) {
      return
    }

    const backupId = backups[0].id

    const res = await app.inject({
      method: 'DELETE',
      path: `/config-editor/backups/${backupId}`,
      headers: { authorization },
    })

    expect(res.statusCode).toBe(200)

    // Verify it was deleted
    const listRes2 = await app.inject({
      method: 'GET',
      path: '/config-editor/backups',
      headers: { authorization },
    })

    expect(listRes2.json().find(b => b.id === backupId)).toBeUndefined()
  })

  afterAll(async () => {
    await app.close()
  })
})
