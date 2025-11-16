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
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { AuthModule } from '../../src/core/auth/auth.module.js'
import { SchedulerService } from '../../src/core/scheduler/scheduler.service.js'
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
      imports: [ConfigEditorModule, AuthModule],
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

    // Wait for initial paths to be setup
    await new Promise(res => setTimeout(res, 1000))
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

  afterAll(async () => {
    await app.close()
  })
})
