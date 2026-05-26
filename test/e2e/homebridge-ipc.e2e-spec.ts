import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'

import { EventEmitter } from 'node:events'
import { resolve } from 'node:path'
import process from 'node:process'

import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { copy } from 'fs-extra'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { HomebridgeIpcModule } from '../../src/core/homebridge-ipc/homebridge-ipc.module.js'
import { HomebridgeIpcService } from '../../src/core/homebridge-ipc/homebridge-ipc.service.js'

describe('HomebridgeIpcService (e2e)', () => {
  let app: NestFastifyApplication
  let ipcService: HomebridgeIpcService

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = resolve(__dirname, '../../')
    process.env.UIX_STORAGE_PATH = resolve(__dirname, '../', '.homebridge')
    process.env.UIX_CONFIG_PATH = resolve(process.env.UIX_STORAGE_PATH, 'config.json')

    await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH)
    await copy(resolve(__dirname, '../mocks', 'auth.json'), resolve(process.env.UIX_STORAGE_PATH, 'auth.json'))
    await copy(resolve(__dirname, '../mocks', '.uix-secrets'), resolve(process.env.UIX_STORAGE_PATH, '.uix-secrets'))

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [HomebridgeIpcModule],
    }).compile()

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    ipcService = app.get(HomebridgeIpcService)
  })

  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('sendMessage', () => {
    it('should throw ServiceUnavailableException when no homebridge process', () => {
      expect(() => ipcService.sendMessage('test')).toThrow('The Homebridge Service Is Unavailable')
    })

    it('should send message when homebridge process is connected', () => {
      const mockProcess = new EventEmitter() as any
      mockProcess.connected = true
      mockProcess.send = vi.fn()
      mockProcess.kill = vi.fn()
      mockProcess.pid = 12345

      ipcService.setHomebridgeProcess(mockProcess)

      ipcService.sendMessage('testEvent', { foo: 'bar' })

      expect(mockProcess.send).toHaveBeenCalledWith({ id: 'testEvent', data: { foo: 'bar' } })
    })
  })

  describe('setHomebridgeProcess', () => {
    it('should forward permitted events from child process', () => {
      const mockProcess = new EventEmitter() as any
      mockProcess.connected = true
      mockProcess.send = vi.fn()
      mockProcess.kill = vi.fn()
      mockProcess.pid = 12345

      ipcService.setHomebridgeProcess(mockProcess)

      const listener = vi.fn()
      ipcService.on('childBridgeStatusUpdate', listener)

      // Simulate a message from the child process
      mockProcess.emit('message', { id: 'childBridgeStatusUpdate', data: { status: 'ok' } })

      expect(listener).toHaveBeenCalledWith({ status: 'ok' })

      ipcService.removeListener('childBridgeStatusUpdate', listener)
    })

    it('should ignore non-permitted events', () => {
      const mockProcess = new EventEmitter() as any
      mockProcess.connected = true
      mockProcess.send = vi.fn()
      mockProcess.kill = vi.fn()
      mockProcess.pid = 12345

      ipcService.setHomebridgeProcess(mockProcess)

      const listener = vi.fn()
      ipcService.on('unknownEvent', listener)

      mockProcess.emit('message', { id: 'unknownEvent', data: {} })

      expect(listener).not.toHaveBeenCalled()

      ipcService.removeListener('unknownEvent', listener)
    })

    it('should ignore non-object messages', () => {
      const mockProcess = new EventEmitter() as any
      mockProcess.connected = true
      mockProcess.send = vi.fn()
      mockProcess.kill = vi.fn()
      mockProcess.pid = 12345

      ipcService.setHomebridgeProcess(mockProcess)

      const listener = vi.fn()
      ipcService.on('childBridgeStatusUpdate', listener)

      // Non-object messages should be ignored and not forwarded
      mockProcess.emit('message', 'not an object')
      mockProcess.emit('message', 42)

      expect(listener).not.toHaveBeenCalled()

      ipcService.removeListener('childBridgeStatusUpdate', listener)
    })

    it('should emit serverStatusUpdate down on process close', () => {
      const mockProcess = new EventEmitter() as any
      mockProcess.connected = true
      mockProcess.send = vi.fn()
      mockProcess.kill = vi.fn()
      mockProcess.pid = 12345

      ipcService.setHomebridgeProcess(mockProcess)

      const listener = vi.fn()
      ipcService.on('serverStatusUpdate', listener)

      mockProcess.emit('close')

      expect(listener).toHaveBeenCalledWith({ status: 'down' })

      ipcService.removeListener('serverStatusUpdate', listener)
    })
  })

  describe('restartHomebridge', () => {
    it('should send SIGTERM to homebridge process', () => {
      const mockProcess = new EventEmitter() as any
      mockProcess.connected = true
      mockProcess.send = vi.fn()
      mockProcess.kill = vi.fn()
      mockProcess.pid = 12345

      ipcService.setHomebridgeProcess(mockProcess)

      ipcService.restartHomebridge()

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM')
    })

    it('should not throw when no homebridge process', () => {
      // Reset the internal process reference by setting a null-like process
      ;(ipcService as any).homebridge = null

      expect(() => ipcService.restartHomebridge()).not.toThrow()
    })

    it('should de-duplicate rapid successive calls', () => {
      const mockProcess = new EventEmitter() as any
      mockProcess.connected = true
      mockProcess.send = vi.fn()
      mockProcess.kill = vi.fn()
      mockProcess.pid = 12345

      ipcService.setHomebridgeProcess(mockProcess)
      // Earlier tests may have left a pending timer set; reset so we
      // exercise the in-flight guard from a known starting state.
      ;(ipcService as any).pendingShutdownTimer = null

      const closeListenersBefore = mockProcess.listenerCount('close')

      ipcService.restartHomebridge()
      ipcService.restartHomebridge()
      ipcService.restartHomebridge()

      // Three rapid clicks add exactly one SIGTERM call and one
      // `once('close')` listener — the second and third hit the guard.
      expect(mockProcess.kill).toHaveBeenCalledTimes(1)
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM')
      expect(mockProcess.listenerCount('close')).toBe(closeListenersBefore + 1)

      // Trip the close handler so the SIGKILL fallback timer clears and
      // the next test starts with `pendingShutdownTimer` null.
      mockProcess.emit('close')
    })
  })

  describe('restartAndWaitForClose', () => {
    it('should resolve true when no homebridge process connected', async () => {
      ;(ipcService as any).homebridge = null

      const result = await ipcService.restartAndWaitForClose()
      expect(result).toBe(true)
    })

    it('should resolve when process closes after restart', async () => {
      const mockProcess = new EventEmitter() as any
      mockProcess.connected = true
      mockProcess.send = vi.fn()
      mockProcess.kill = vi.fn().mockImplementation(() => {
        // Simulate process closing after kill
        setTimeout(() => mockProcess.emit('close'), 10)
      })
      mockProcess.pid = 12345

      ipcService.setHomebridgeProcess(mockProcess)

      const result = await ipcService.restartAndWaitForClose()
      expect(result).toBe(true)
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM')
    })
  })

  describe('killHomebridge', () => {
    it('should send SIGKILL to homebridge process', async () => {
      const mockProcess = new EventEmitter() as any
      mockProcess.connected = true
      mockProcess.send = vi.fn()
      mockProcess.kill = vi.fn()
      mockProcess.pid = 12345

      ipcService.setHomebridgeProcess(mockProcess)

      await ipcService.killHomebridge()

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL')
    })

    it('should not throw when no homebridge process', async () => {
      ;(ipcService as any).homebridge = null

      await expect(ipcService.killHomebridge()).resolves.not.toThrow()
    })
  })

  describe('setHomebridgeVersion', () => {
    it('should set the homebridge version on config service', () => {
      ipcService.setHomebridgeVersion('1.7.0')
      expect((ipcService as any).configService.homebridgeVersion).toBe('1.7.0')
    })
  })

  describe('requestResponse', () => {
    it('should resolve when response event is emitted', async () => {
      const mockProcess = new EventEmitter() as any
      mockProcess.connected = true
      mockProcess.send = vi.fn()
      mockProcess.kill = vi.fn()
      mockProcess.pid = 12345

      ipcService.setHomebridgeProcess(mockProcess)

      // Schedule the response to come back after a short delay
      setTimeout(() => {
        ipcService.emit('testResponse', { result: 'success' })
      }, 50)

      const result = await ipcService.requestResponse('testRequest', 'testResponse')
      expect(result).toEqual({ result: 'success' })
      expect(mockProcess.send).toHaveBeenCalledWith({ id: 'testRequest', data: undefined })
    })

    it('should reject on timeout when no response', async () => {
      const mockProcess = new EventEmitter() as any
      mockProcess.connected = true
      mockProcess.send = vi.fn()
      mockProcess.kill = vi.fn()
      mockProcess.pid = 12345

      ipcService.setHomebridgeProcess(mockProcess)

      await expect(ipcService.requestResponse('testRequest', 'testResponse'))
        .rejects
        .toThrow('The Homebridge service did not respond')
    }, 10000)

    it('restartHomebridge logs when SIGTERM delivery is refused', async () => {
      const mockProcess = new EventEmitter() as any
      mockProcess.connected = true
      mockProcess.send = vi.fn()
      mockProcess.kill = vi.fn().mockReturnValue(false)
      mockProcess.pid = 12345
      ipcService.setHomebridgeProcess(mockProcess)

      const errorSpy = vi.spyOn(ipcService['logger'], 'error')

      try {
        ipcService.restartHomebridge()
        expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM')
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('SIGTERM'))
      } finally {
        errorSpy.mockRestore()
        mockProcess.emit('close')
      }
    })

    it('killHomebridge surfaces a failed kill() delivery as killFailed', async () => {
      const mockProcess = new EventEmitter() as any
      mockProcess.connected = true
      mockProcess.send = vi.fn()
      mockProcess.kill = vi.fn().mockReturnValue(false)
      mockProcess.pid = 12345
      ipcService.setHomebridgeProcess(mockProcess)

      const statusListener = vi.fn()
      ipcService.on('serverStatusUpdate', statusListener)

      try {
        const delivered = await ipcService.killHomebridge()
        // The caller (postBackupRestoreRestart) hinges on this bool to
        // decide whether to self-kill the UI; a false return must
        // propagate.
        expect(delivered).toBe(false)
        expect(statusListener).toHaveBeenCalledWith({ status: 'killFailed' })
      } finally {
        ipcService.off('serverStatusUpdate', statusListener)
      }
    })

    it('cleans up the once-listener and timer when sendMessage throws', async () => {
      const spy = vi.spyOn(ipcService, 'sendMessage').mockImplementation(() => {
        throw new Error('IPC down')
      })
      try {
        await expect(ipcService.requestResponse('foo', 'foo-response')).rejects.toThrow('IPC down')
        // Without cleanup the once-listener would linger for 3 s and a
        // later caller emitting `foo-response` would have it swallowed.
        expect(ipcService.listenerCount('foo-response')).toBe(0)
      } finally {
        spy.mockRestore()
      }
    })
  })

  afterAll(async () => {
    await app.close()
  })
})
