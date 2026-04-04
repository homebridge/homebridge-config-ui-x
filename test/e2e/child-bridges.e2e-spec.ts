import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'

import { EventEmitter } from 'node:events'
import { resolve } from 'node:path'
import process from 'node:process'

import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { copy } from 'fs-extra'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { HomebridgeIpcService } from '../../src/core/homebridge-ipc/homebridge-ipc.service.js'
import { AccessoriesService } from '../../src/modules/accessories/accessories.service.js'
import { ChildBridgesGateway } from '../../src/modules/child-bridges/child-bridges.gateway.js'
import { ChildBridgesModule } from '../../src/modules/child-bridges/child-bridges.module.js'
import { ChildBridgesService } from '../../src/modules/child-bridges/child-bridges.service.js'

describe('ChildBridges (e2e)', () => {
  let app: NestFastifyApplication

  let childBridgesService: ChildBridgesService
  let childBridgesGateway: ChildBridgesGateway
  let homebridgeIpcService: HomebridgeIpcService
  let accessoriesService: AccessoriesService
  let client: EventEmitter

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = resolve(__dirname, '../../')
    process.env.UIX_STORAGE_PATH = resolve(__dirname, '../', '.homebridge')
    process.env.UIX_CONFIG_PATH = resolve(process.env.UIX_STORAGE_PATH, 'config.json')

    // Setup test config
    await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH)

    // Setup test auth file
    await copy(resolve(__dirname, '../mocks', 'auth.json'), resolve(process.env.UIX_STORAGE_PATH, 'auth.json'))
    await copy(resolve(__dirname, '../mocks', '.uix-secrets'), resolve(process.env.UIX_STORAGE_PATH, '.uix-secrets'))

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ChildBridgesModule],
    }).compile()

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter())

    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    childBridgesService = app.get(ChildBridgesService)
    childBridgesGateway = app.get(ChildBridgesGateway)
    homebridgeIpcService = app.get(HomebridgeIpcService)
    accessoriesService = app.get(AccessoriesService)
  })

  beforeEach(async () => {
    if (client) {
      client.emit('disconnect')
    }

    vi.resetAllMocks()

    // Create client
    client = new EventEmitter()
    vi.spyOn(client, 'emit')
    vi.spyOn(client, 'on')
  })

  describe('ChildBridgesGateway', () => {
    it('should return child bridge metadata when IPC responds', async () => {
      const mockMetadata = [
        { status: 'ok', username: '0E:AA:BB:CC:DD:EE', name: 'Test Bridge', plugin: 'test-plugin', identifier: 'test', pin: '123-45-678', manuallyStopped: false },
      ]

      // Simulate IPC responding to the metadata request
      vi.spyOn(homebridgeIpcService, 'sendMessage').mockImplementation(() => {})
      vi.spyOn(childBridgesService, 'getChildBridges').mockResolvedValue(mockMetadata as any)

      const result = await childBridgesGateway.getChildBridges()
      expect(result).toEqual(mockMetadata)
    })

    it('should return empty array when IPC times out', async () => {
      vi.spyOn(childBridgesService, 'getChildBridges').mockResolvedValue([])

      const result = await childBridgesGateway.getChildBridges()
      expect(result).toEqual([])
    })

    it('should return WsException when getChildBridges throws', async () => {
      vi.spyOn(childBridgesService, 'getChildBridges').mockRejectedValue(new Error('IPC error'))

      const result = await childBridgesGateway.getChildBridges()
      expect(result).toBeDefined()
      expect((result as any).message).toBe('IPC error')
    })

    it('should start watching child bridge status', async () => {
      vi.spyOn(childBridgesService, 'watchChildBridgeStatus').mockResolvedValue(undefined)

      await childBridgesGateway.watchChildBridgeStatus(client)
      expect(childBridgesService.watchChildBridgeStatus).toHaveBeenCalledWith(client)
    })

    it('should restart a child bridge', async () => {
      vi.spyOn(childBridgesService, 'restartChildBridge').mockReturnValue({ ok: true })

      const result = await childBridgesGateway.restartChildBridge(client, '0EAA:BB:CC:DD:EE')
      expect(result).toEqual({ ok: true })
      expect(childBridgesService.restartChildBridge).toHaveBeenCalledWith('0EAA:BB:CC:DD:EE')
    })

    it('should return WsException when restartChildBridge throws', async () => {
      vi.spyOn(childBridgesService, 'restartChildBridge').mockImplementation(() => {
        throw new Error('restart failed')
      })

      const result = await childBridgesGateway.restartChildBridge(client, 'bad-id')
      expect(result).toBeDefined()
      expect((result as any).message).toBe('restart failed')
    })

    it('should stop a child bridge', async () => {
      vi.spyOn(childBridgesService, 'stopChildBridge').mockReturnValue({ ok: true })

      const result = await childBridgesGateway.stopChildBridge(client, '0E:AA:BB:CC:DD:EE')
      expect(result).toEqual({ ok: true })
      expect(childBridgesService.stopChildBridge).toHaveBeenCalledWith('0E:AA:BB:CC:DD:EE')
    })

    it('should return WsException when stopChildBridge throws', async () => {
      vi.spyOn(childBridgesService, 'stopChildBridge').mockImplementation(() => {
        throw new Error('stop failed')
      })

      const result = await childBridgesGateway.stopChildBridge(client, 'bad-id')
      expect(result).toBeDefined()
      expect((result as any).message).toBe('stop failed')
    })

    it('should start a child bridge', async () => {
      vi.spyOn(childBridgesService, 'startChildBridge').mockReturnValue({ ok: true })

      const result = await childBridgesGateway.startChildBridge(client, '0E:AA:BB:CC:DD:EE')
      expect(result).toEqual({ ok: true })
      expect(childBridgesService.startChildBridge).toHaveBeenCalledWith('0E:AA:BB:CC:DD:EE')
    })

    it('should return WsException when startChildBridge throws', async () => {
      vi.spyOn(childBridgesService, 'startChildBridge').mockImplementation(() => {
        throw new Error('start failed')
      })

      const result = await childBridgesGateway.startChildBridge(client, 'bad-id')
      expect(result).toBeDefined()
      expect((result as any).message).toBe('start failed')
    })
  })

  describe('ChildBridgesService', () => {
    it('should return empty array when IPC requestResponse times out', async () => {
      // Don't set up a homebridge process, so requestResponse will fail
      const result = await childBridgesService.getChildBridges()
      expect(result).toEqual([])
    })

    it('should format 12-char deviceId with colons', () => {
      vi.spyOn(homebridgeIpcService, 'sendMessage').mockImplementation(() => {})
      vi.spyOn(accessoriesService, 'resetInstancePool').mockImplementation(() => {})

      const result = childBridgesService.stopStartRestartChildBridge('restartChildBridge', '0EAABBCCDDEE')

      expect(homebridgeIpcService.sendMessage).toHaveBeenCalledWith('restartChildBridge', '0E:AA:BB:CC:DD:EE')
      expect(result).toEqual({ ok: true })
    })

    it('should pass through already-formatted deviceId', () => {
      vi.spyOn(homebridgeIpcService, 'sendMessage').mockImplementation(() => {})
      vi.spyOn(accessoriesService, 'resetInstancePool').mockImplementation(() => {})

      const result = childBridgesService.stopStartRestartChildBridge('stopChildBridge', '0E:AA:BB:CC:DD:EE')

      expect(homebridgeIpcService.sendMessage).toHaveBeenCalledWith('stopChildBridge', '0E:AA:BB:CC:DD:EE')
      expect(result).toEqual({ ok: true })
    })

    it('should call resetInstancePool after a delay', async () => {
      vi.useFakeTimers()

      vi.spyOn(homebridgeIpcService, 'sendMessage').mockImplementation(() => {})
      vi.spyOn(accessoriesService, 'resetInstancePool').mockImplementation(() => {})

      childBridgesService.stopStartRestartChildBridge('restartChildBridge', '0E:AA:BB:CC:DD:EE')

      expect(accessoriesService.resetInstancePool).not.toHaveBeenCalled()

      vi.advanceTimersByTime(5000)

      expect(accessoriesService.resetInstancePool).toHaveBeenCalled()

      vi.useRealTimers()
    })

    it('should delegate restartChildBridge to stopStartRestartChildBridge', () => {
      vi.spyOn(homebridgeIpcService, 'sendMessage').mockImplementation(() => {})
      vi.spyOn(accessoriesService, 'resetInstancePool').mockImplementation(() => {})

      const result = childBridgesService.restartChildBridge('0E:AA:BB:CC:DD:EE')

      expect(homebridgeIpcService.sendMessage).toHaveBeenCalledWith('restartChildBridge', '0E:AA:BB:CC:DD:EE')
      expect(result).toEqual({ ok: true })
    })

    it('should delegate stopChildBridge to stopStartRestartChildBridge', () => {
      vi.spyOn(homebridgeIpcService, 'sendMessage').mockImplementation(() => {})
      vi.spyOn(accessoriesService, 'resetInstancePool').mockImplementation(() => {})

      const result = childBridgesService.stopChildBridge('0E:AA:BB:CC:DD:EE')

      expect(homebridgeIpcService.sendMessage).toHaveBeenCalledWith('stopChildBridge', '0E:AA:BB:CC:DD:EE')
      expect(result).toEqual({ ok: true })
    })

    it('should delegate startChildBridge to stopStartRestartChildBridge', () => {
      vi.spyOn(homebridgeIpcService, 'sendMessage').mockImplementation(() => {})
      vi.spyOn(accessoriesService, 'resetInstancePool').mockImplementation(() => {})

      const result = childBridgesService.startChildBridge('0E:AA:BB:CC:DD:EE')

      // Note: startChildBridge actually sends 'restartChildBridge' event (as per source)
      expect(homebridgeIpcService.sendMessage).toHaveBeenCalledWith('restartChildBridge', '0E:AA:BB:CC:DD:EE')
      expect(result).toEqual({ ok: true })
    })

    it('should watch child bridge status and forward updates to client', async () => {
      await childBridgesService.watchChildBridgeStatus(client)

      const statusData = { status: 'ok', username: '0E:AA:BB:CC:DD:EE' }
      homebridgeIpcService.emit('childBridgeStatusUpdate', statusData)

      expect(client.emit).toHaveBeenCalledWith('child-bridge-status-update', statusData)
    })

    it('should clean up listeners on client disconnect', async () => {
      await childBridgesService.watchChildBridgeStatus(client)

      const initialIpcListenerCount = homebridgeIpcService.listenerCount('childBridgeStatusUpdate')
      expect(initialIpcListenerCount).toBe(1)

      // Simulate disconnect
      client.emit('disconnect')

      expect(homebridgeIpcService.listenerCount('childBridgeStatusUpdate')).toBe(0)
    })

    it('should clean up listeners on client end', async () => {
      await childBridgesService.watchChildBridgeStatus(client)

      expect(homebridgeIpcService.listenerCount('childBridgeStatusUpdate')).toBe(1)

      // Simulate end
      client.emit('end')

      expect(homebridgeIpcService.listenerCount('childBridgeStatusUpdate')).toBe(0)
    })
  })

  afterAll(async () => {
    await app.close()
  })
})
