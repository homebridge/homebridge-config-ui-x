import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'
import type { MockInstance } from 'vitest'

import { resolve } from 'node:path'
import process from 'node:process'

import { ValidationPipe } from '@nestjs/common'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { copy, remove } from 'fs-extra'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthModule } from '../../src/core/auth/auth.module.js'
import { ConfigService } from '../../src/core/config/config.service.js'
import { AccessoriesModule } from '../../src/modules/accessories/accessories.module.js'
import { AccessoriesService } from '../../src/modules/accessories/accessories.service.js'

describe('AccessoriesController (e2e)', () => {
  let app: NestFastifyApplication

  let configService: ConfigService
  let accessoriesService: AccessoriesService

  let authFilePath: string
  let secretsFilePath: string
  let authorization: string

  const refreshCharacteristics = vi.fn()
  const getCharacteristic = vi.fn()
  const setValue = vi.fn()

  const booleanCharacteristic = {
    setValue,
    type: 'On',
    value: true,
    format: 'bool',
    canWrite: true,
  }

  const intCharacteristic = {
    setValue,
    type: 'Active',
    value: 1,
    format: 'uint8',
    maxValue: 1,
    minValue: 0,
    canWrite: true,
  }

  const floatCharacteristic = {
    setValue,
    type: 'TargetTemperature',
    value: 1,
    format: 'float',
    maxValue: 100,
    minValue: 18,
    canWrite: true,
  }

  const mockedServices = [
    {
      refreshCharacteristics,
      getCharacteristic,
      serviceCharacteristics: [
        booleanCharacteristic,
        intCharacteristic,
        floatCharacteristic,
      ],
      uniqueId: 'c8964091efa500870e34996208e670cf7dc362d244e0410220752459a5e78d1c',
    },
  ]

  let hapClientMock: MockInstance

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = resolve(__dirname, '../../')
    process.env.UIX_STORAGE_PATH = resolve(__dirname, '../', '.homebridge')
    process.env.UIX_CONFIG_PATH = resolve(process.env.UIX_STORAGE_PATH, 'config.json')

    authFilePath = resolve(process.env.UIX_STORAGE_PATH, 'auth.json')
    secretsFilePath = resolve(process.env.UIX_STORAGE_PATH, '.uix-secrets')

    // Setup test config
    await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH)

    // Setup test auth file
    await copy(resolve(__dirname, '../mocks', 'auth.json'), authFilePath)
    await copy(resolve(__dirname, '../mocks', '.uix-secrets'), secretsFilePath)

    // Clear any accessory layout left behind by a previous run. The layout is
    // written by the save test later in this file, so without this the
    // "user not in layout" test sees the saved layout and fails on every run
    // after the first. CI never caught it because CI always starts clean.
    await remove(resolve(process.env.UIX_STORAGE_PATH, 'accessories', 'uiAccessoriesLayout.json'))

    // Enable insecure mode for this test suite.
    configService = new ConfigService()
    configService.homebridgeInsecureMode = true

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AccessoriesModule, AuthModule],
    }).overrideProvider(ConfigService).useValue(configService).compile()

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter())

    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      skipMissingProperties: true,
    }))

    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    accessoriesService = app.get(AccessoriesService)
  })

  beforeEach(async () => {
    vi.resetAllMocks()

    // Enable insecure mode
    configService.homebridgeInsecureMode = true

    // Setup mocks
    hapClientMock = vi.spyOn(accessoriesService.hapClient, 'getAllServices')
      .mockResolvedValue(mockedServices as any)

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

  it('GET /accessories (insecure mode enabled)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/accessories',
      headers: {
        authorization,
      },
    })

    expect(hapClientMock).toHaveBeenCalledTimes(1)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(1)
  })

  it('GET /accessories (insecure mode disabled)', async () => {
    configService.homebridgeInsecureMode = false

    const res = await app.inject({
      method: 'GET',
      path: '/accessories',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(400)
  })

  it('GET /accessories/layout', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/accessories/layout',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
  })

  it('GET /accessories/:uniqueId (valid unique id)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/accessories/c8964091efa500870e34996208e670cf7dc362d244e0410220752459a5e78d1c',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(refreshCharacteristics).toHaveBeenCalledTimes(1)
  })

  it('GET /accessories/:uniqueId (invalid unique id)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/accessories/xxxx',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(400)
  })

  it('PUT /accessories/:uniqueId (boolean - valid)', async () => {
    getCharacteristic.mockReturnValueOnce(booleanCharacteristic)

    const res = await app.inject({
      method: 'PUT',
      path: '/accessories/c8964091efa500870e34996208e670cf7dc362d244e0410220752459a5e78d1c',
      headers: {
        authorization,
      },
      payload: {
        characteristicType: 'On',
        value: 'true',
      },
    })

    expect(getCharacteristic).toHaveBeenCalled()
    expect(setValue).toHaveBeenCalledWith(true)
    expect(res.statusCode).toBe(200)
  })

  it('PUT /accessories/:uniqueId (boolean - invalid)', async () => {
    getCharacteristic.mockReturnValueOnce(booleanCharacteristic)

    const res = await app.inject({
      method: 'PUT',
      path: '/accessories/c8964091efa500870e34996208e670cf7dc362d244e0410220752459a5e78d1c',
      headers: {
        authorization,
      },
      payload: {
        characteristicType: 'On',
        value: 'not a boolean',
      },
    })

    expect(getCharacteristic).toHaveBeenCalled()
    expect(setValue).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
  })

  it('PUT /accessories/:uniqueId (int - valid)', async () => {
    getCharacteristic.mockReturnValueOnce(intCharacteristic)

    const res = await app.inject({
      method: 'PUT',
      path: '/accessories/c8964091efa500870e34996208e670cf7dc362d244e0410220752459a5e78d1c',
      headers: {
        authorization,
      },
      payload: {
        characteristicType: 'Active',
        value: 1,
      },
    })

    expect(getCharacteristic).toHaveBeenCalled()
    expect(setValue).toHaveBeenCalledWith(1)
    expect(res.statusCode).toBe(200)
  })

  it('PUT /accessories/:uniqueId (int - out of range)', async () => {
    getCharacteristic.mockReturnValueOnce(intCharacteristic)

    const res = await app.inject({
      method: 'PUT',
      path: '/accessories/c8964091efa500870e34996208e670cf7dc362d244e0410220752459a5e78d1c',
      headers: {
        authorization,
      },
      payload: {
        characteristicType: 'Active',
        value: 22,
      },
    })

    expect(getCharacteristic).toHaveBeenCalled()
    expect(setValue).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
  })

  it('PUT /accessories/:uniqueId (float - valid)', async () => {
    getCharacteristic.mockReturnValueOnce(floatCharacteristic)

    const res = await app.inject({
      method: 'PUT',
      path: '/accessories/c8964091efa500870e34996208e670cf7dc362d244e0410220752459a5e78d1c',
      headers: {
        authorization,
      },
      payload: {
        characteristicType: 'TargetTemperature',
        value: '22.5',
      },
    })

    expect(getCharacteristic).toHaveBeenCalled()
    expect(setValue).toHaveBeenCalledWith(22.5)
    expect(res.statusCode).toBe(200)
  })

  it('PUT /accessories/:uniqueId (float - out of range)', async () => {
    getCharacteristic.mockReturnValueOnce(floatCharacteristic)

    const res = await app.inject({
      method: 'PUT',
      path: '/accessories/c8964091efa500870e34996208e670cf7dc362d244e0410220752459a5e78d1c',
      headers: {
        authorization,
      },
      payload: {
        characteristicType: 'TargetTemperature',
        value: '12.6',
      },
    })

    expect(getCharacteristic).toHaveBeenCalled()
    expect(setValue).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
  })

  it('PUT /accessories/:uniqueId (invalid characteristic type)', async () => {
    getCharacteristic.mockReturnValueOnce(null)

    const res = await app.inject({
      method: 'PUT',
      path: '/accessories/c8964091efa500870e34996208e670cf7dc362d244e0410220752459a5e78d1c',
      headers: {
        authorization,
      },
      payload: {
        characteristicType: 'NotReal',
        value: '12.6',
      },
    })

    expect(getCharacteristic).toHaveBeenCalledWith('NotReal')
    expect(setValue).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
  })

  it('PUT /accessories/:uniqueId (missing characteristic type)', async () => {
    getCharacteristic.mockReturnValueOnce(null)

    const res = await app.inject({
      method: 'PUT',
      path: '/accessories/c8964091efa500870e34996208e670cf7dc362d244e0410220752459a5e78d1c',
      headers: {
        authorization,
      },
      payload: {
        value: '12.6',
      },
    })

    expect(getCharacteristic).not.toHaveBeenCalled()
    expect(setValue).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
    expect(res.body).toContain('characteristicType should not be null or undefined')
  })

  it('PUT /accessories/:uniqueId (missing value)', async () => {
    getCharacteristic.mockReturnValueOnce(null)

    const res = await app.inject({
      method: 'PUT',
      path: '/accessories/c8964091efa500870e34996208e670cf7dc362d244e0410220752459a5e78d1c',
      headers: {
        authorization,
      },
      payload: {
        characteristicType: 'TargetTemperature',
      },
    })

    expect(getCharacteristic).not.toHaveBeenCalled()
    expect(setValue).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
    expect(res.body).toContain('value should not be null or undefined')
  })

  it('GET /accessories/layout (returns default room when user not in layout)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/accessories/layout',
      headers: {
        authorization,
      },
    })

    expect(res.statusCode).toBe(200)
    const layout = res.json()
    expect(Array.isArray(layout)).toBe(true)
    expect(layout).toHaveLength(1)
    expect(layout[0].name).toBe('Default Room')
    expect(layout[0].isDefault).toBe(true)
  })

  it('service.saveAccessoryLayout should save and return layout', async () => {
    const layout = {
      rooms: [{ name: 'Living Room', services: ['abc'] }],
    }

    const result = await accessoriesService.saveAccessoryLayout('admin', layout as any)
    expect(result).toEqual(layout)

    // Now getAccessoryLayout should return the saved layout
    const loaded = await accessoriesService.getAccessoryLayout('admin')
    expect(loaded).toEqual(layout)
  })

  it('service.resetInstancePool should not throw when insecure mode disabled', () => {
    configService.homebridgeInsecureMode = false
    // Should be a no-op when insecure mode is disabled
    expect(() => accessoriesService.resetInstancePool()).not.toThrow()
    configService.homebridgeInsecureMode = true
  })

  afterAll(async () => {
    await app.close()
  })
})
