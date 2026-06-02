import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'
import type { MockInstance } from 'vitest'

import { resolve } from 'node:path'
import process from 'node:process'

import { ValidationPipe } from '@nestjs/common'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { copy } from 'fs-extra'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthModule } from '../../src/core/auth/auth.module.js'
import { ConfigService } from '../../src/core/config/config.service.js'
import { AccessoriesModule } from '../../src/modules/accessories/accessories.module.js'
import { AccessoriesService } from '../../src/modules/accessories/accessories.service.js'
import { SmartAutomationsModule } from '../../src/modules/smart-automations/smart-automations.module.js'
import { SmartAutomationsService } from '../../src/modules/smart-automations/smart-automations.service.js'

describe('AccessoriesController (e2e)', () => {
  let app: NestFastifyApplication

  let configService: ConfigService
  let accessoriesService: AccessoriesService
  let smartAutomationsService: SmartAutomationsService

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

    // Enable insecure mode for this test suite.
    configService = new ConfigService()
    configService.homebridgeInsecureMode = true

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AccessoriesModule, SmartAutomationsModule, AuthModule],
    }).overrideProvider(ConfigService).useValue(configService).compile()

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter())

    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      skipMissingProperties: true,
    }))

    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    accessoriesService = app.get(AccessoriesService)
    smartAutomationsService = app.get(SmartAutomationsService)
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

  it('PUT /accessories/automation/smart-light-group (valid)', async () => {
    const onCharacteristic = {
      type: 'On',
      canWrite: true,
      value: false,
      setValue: vi.fn(async (value: boolean) => {
        onCharacteristic.value = value
      }),
    }
    const brightnessCharacteristic = {
      type: 'Brightness',
      canWrite: true,
      value: 45,
      setValue: vi.fn(async (value: number) => {
        brightnessCharacteristic.value = value
      }),
    }
    const lightbulbService = {
      uniqueId: 'light-1',
      type: 'Lightbulb',
      serviceCharacteristics: [onCharacteristic, brightnessCharacteristic],
      getCharacteristic: vi.fn((type: string) => {
        if (type === 'On') {
          return onCharacteristic
        }
        if (type === 'Brightness') {
          return brightnessCharacteristic
        }
        return null
      }),
    }

    hapClientMock.mockResolvedValue([lightbulbService] as any)

    const res = await app.inject({
      method: 'PUT',
      path: '/accessories/automation/smart-light-group',
      headers: {
        authorization,
      },
      payload: {
        uniqueIds: ['light-1'],
        restoreAfterMs: 1000,
      },
    })

    expect(res.statusCode).toBe(200)
    expect(onCharacteristic.setValue).toHaveBeenCalledWith(true)

    await new Promise(resolve => setTimeout(resolve, 1100))

    expect(brightnessCharacteristic.setValue).toHaveBeenCalledWith(45)
    expect(onCharacteristic.setValue).toHaveBeenLastCalledWith(false)
  })

  it('PUT /accessories/automation/smart-light-group (no lightbulb services)', async () => {
    const switchService = {
      uniqueId: 'switch-1',
      type: 'Switch',
      serviceCharacteristics: [],
      getCharacteristic: vi.fn(() => null),
    }

    hapClientMock.mockResolvedValue([switchService] as any)

    const res = await app.inject({
      method: 'PUT',
      path: '/accessories/automation/smart-light-group',
      headers: {
        authorization,
      },
      payload: {
        uniqueIds: ['switch-1'],
      },
    })

    expect(res.statusCode).toBe(400)
    expect(res.body).toContain('No lightbulb services were found')
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

  it('service smart automation CRUD should save, update and delete', async () => {
    const created = await smartAutomationsService.saveSmartAutomation('admin', {
      name: 'Hallway Motion Lights',
      type: 'smart-light-group',
      uniqueIds: ['light-1', 'light-2'],
      restoreAfterMs: 120000,
      enabled: true,
    })

    expect(created.id).toBeTruthy()
    expect(created.uniqueIds).toEqual(['light-1', 'light-2'])
    expect(created.enabled).toBe(true)

    const listAfterCreate = await smartAutomationsService.getSmartAutomations('admin')
    expect(listAfterCreate).toHaveLength(1)

    const updated = await smartAutomationsService.saveSmartAutomation('admin', {
      ...created,
      name: 'Hallway Motion Lights Updated',
      uniqueIds: ['light-2'],
      restoreAfterMs: 90000,
      enabled: false,
    })

    expect(updated.name).toBe('Hallway Motion Lights Updated')
    expect(updated.uniqueIds).toEqual(['light-2'])
    expect(updated.enabled).toBe(false)

    const listAfterUpdate = await smartAutomationsService.getSmartAutomations('admin')
    expect(listAfterUpdate).toHaveLength(1)
    expect(listAfterUpdate[0].name).toBe('Hallway Motion Lights Updated')

    await smartAutomationsService.deleteSmartAutomation('admin', created.id)

    const listAfterDelete = await smartAutomationsService.getSmartAutomations('admin')
    expect(listAfterDelete).toHaveLength(0)
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
