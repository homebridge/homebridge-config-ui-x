import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'

import process from 'node:process'

import { HttpService } from '@nestjs/axios'
import { of } from 'rxjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ConfigService } from '../../src/core/config/config.service.js'
import { HomebridgeIpcService } from '../../src/core/homebridge-ipc/homebridge-ipc.service.js'
import { Logger } from '../../src/core/logger/logger.service.js'
import { isNodeV24SupportedArchitecture } from '../../src/core/node-version.constants.js'
import { PluginsService } from '../../src/modules/plugins/plugins.service.js'
import { ServerService } from '../../src/modules/server/server.service.js'
import { StatusService } from '../../src/modules/status/status.service.js'

interface NodeJsVersionInfo {
  currentVersion: string
  latestVersion: string
  updateAvailable: boolean
  showNodeUnsupportedWarning: boolean
  installPath?: string
  npmVersion?: string | null
  architecture: string
  supportsNodeJs24: boolean
}

describe('StatusService - getNodeJsVersionInfo', () => {
  let statusService: StatusService
  let httpService: HttpService
  let originalProcessVersion: string

  const mockNodeVersions = [
    { version: 'v24.2.0', lts: 'Krypton' },
    { version: 'v24.1.0', lts: 'Krypton' },
    { version: 'v22.13.0', lts: 'Jod' },
    { version: 'v22.12.0', lts: 'Jod' },
    { version: 'v20.20.0', lts: 'Iron' },
    { version: 'v20.19.0', lts: 'Iron' },
  ]

  beforeEach(() => {
    // Store original process.version to restore later
    originalProcessVersion = process.version

    // Create mock dependencies
    httpService = new HttpService()
    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as Logger

    const configService = {
      ui: { disableServerMetricsMonitoring: true },
    } as unknown as ConfigService

    const pluginsService = {} as PluginsService
    const serverService = {} as ServerService
    const homebridgeIpcService = {
      on: vi.fn(),
    } as unknown as HomebridgeIpcService

    statusService = new StatusService(
      httpService,
      logger,
      configService,
      pluginsService,
      serverService,
      homebridgeIpcService,
    )

    // Clear cache before each test
    // @ts-expect-error - accessing private property for testing
    statusService.statusCache.flushAll()
  })

  const mockHttpResponse = (data: any): AxiosResponse => ({
    data,
    headers: {},
    config: { url: 'https://nodejs.org/dist/index.json' } as InternalAxiosRequestConfig,
    status: 200,
    statusText: 'OK',
  })

  describe('Node.js v20 users', () => {
    it('should recommend v24 when on v20 with 64-bit architecture', async () => {
      const isNode24Supported = isNodeV24SupportedArchitecture()

      // Skip test if not on 64-bit architecture
      if (!isNode24Supported) {
        return
      }

      // Mock process.version
      Object.defineProperty(process, 'version', {
        value: 'v20.19.0',
        writable: true,
        configurable: true,
      })

      vi.spyOn(httpService, 'get').mockReturnValue(of(mockHttpResponse(mockNodeVersions)) as any)

      const result = await statusService.getNodeJsVersionInfo() as NodeJsVersionInfo

      expect(result.currentVersion).toBe('v20.19.0')
      expect(result.latestVersion).toBe('v24.2.0')
      expect(result.updateAvailable).toBe(true)
      expect(result.showNodeUnsupportedWarning).toBe(false)
      expect(result.supportsNodeJs24).toBe(true)

      // Restore original version
      Object.defineProperty(process, 'version', {
        value: originalProcessVersion,
        writable: true,
        configurable: true,
      })
    })

    it('should recommend v22 when on v20 with 32-bit architecture', async () => {
      const isNode24Supported = isNodeV24SupportedArchitecture()

      // Skip test if on 64-bit architecture
      if (isNode24Supported) {
        return
      }

      // Mock process.version
      Object.defineProperty(process, 'version', {
        value: 'v20.19.0',
        writable: true,
        configurable: true,
      })

      vi.spyOn(httpService, 'get').mockReturnValue(of(mockHttpResponse(mockNodeVersions)) as any)

      const result = await statusService.getNodeJsVersionInfo() as NodeJsVersionInfo

      expect(result.currentVersion).toBe('v20.19.0')
      expect(result.latestVersion).toBe('v22.13.0')
      expect(result.updateAvailable).toBe(true)
      expect(result.showNodeUnsupportedWarning).toBe(false)
      expect(result.supportsNodeJs24).toBe(false)

      // Restore original version
      Object.defineProperty(process, 'version', {
        value: originalProcessVersion,
        writable: true,
        configurable: true,
      })
    })
  })

  describe('Node.js v22 users', () => {
    it('should recommend newer v22 patch when available', async () => {
      // Mock process.version to an older v22
      Object.defineProperty(process, 'version', {
        value: 'v22.12.0',
        writable: true,
        configurable: true,
      })

      vi.spyOn(httpService, 'get').mockReturnValue(of(mockHttpResponse(mockNodeVersions)) as any)

      const result = await statusService.getNodeJsVersionInfo() as NodeJsVersionInfo

      expect(result.currentVersion).toBe('v22.12.0')
      expect(result.latestVersion).toBe('v22.13.0')
      expect(result.updateAvailable).toBe(true)
      expect(result.showNodeUnsupportedWarning).toBe(false)

      // Restore original version
      Object.defineProperty(process, 'version', {
        value: originalProcessVersion,
        writable: true,
        configurable: true,
      })
    })

    it('should recommend v24 when on latest v22 with 64-bit architecture', async () => {
      const isNode24Supported = isNodeV24SupportedArchitecture()

      // Skip test if not on 64-bit architecture
      if (!isNode24Supported) {
        return
      }

      // Mock process.version to latest v22
      Object.defineProperty(process, 'version', {
        value: 'v22.13.0',
        writable: true,
        configurable: true,
      })

      vi.spyOn(httpService, 'get').mockReturnValue(of(mockHttpResponse(mockNodeVersions)) as any)

      const result = await statusService.getNodeJsVersionInfo() as NodeJsVersionInfo

      expect(result.currentVersion).toBe('v22.13.0')
      expect(result.latestVersion).toBe('v24.2.0')
      expect(result.updateAvailable).toBe(true)
      expect(result.showNodeUnsupportedWarning).toBe(false)
      expect(result.supportsNodeJs24).toBe(true)

      // Restore original version
      Object.defineProperty(process, 'version', {
        value: originalProcessVersion,
        writable: true,
        configurable: true,
      })
    })

    it('should show no update when on latest v22 with 32-bit architecture', async () => {
      const isNode24Supported = isNodeV24SupportedArchitecture()

      // Skip test if on 64-bit architecture
      if (isNode24Supported) {
        return
      }

      // Mock process.version to latest v22
      Object.defineProperty(process, 'version', {
        value: 'v22.13.0',
        writable: true,
        configurable: true,
      })

      vi.spyOn(httpService, 'get').mockReturnValue(of(mockHttpResponse(mockNodeVersions)) as any)

      const result = await statusService.getNodeJsVersionInfo() as NodeJsVersionInfo

      expect(result.currentVersion).toBe('v22.13.0')
      expect(result.latestVersion).toBe('v22.13.0')
      expect(result.updateAvailable).toBe(false)
      expect(result.showNodeUnsupportedWarning).toBe(false)
      expect(result.supportsNodeJs24).toBe(false)

      // Restore original version
      Object.defineProperty(process, 'version', {
        value: originalProcessVersion,
        writable: true,
        configurable: true,
      })
    })
  })

  describe('Node.js v24 users', () => {
    it('should recommend newer v24 patch when available', async () => {
      // Mock process.version to an older v24
      Object.defineProperty(process, 'version', {
        value: 'v24.1.0',
        writable: true,
        configurable: true,
      })

      vi.spyOn(httpService, 'get').mockReturnValue(of(mockHttpResponse(mockNodeVersions)) as any)

      const result = await statusService.getNodeJsVersionInfo() as NodeJsVersionInfo

      expect(result.currentVersion).toBe('v24.1.0')
      expect(result.latestVersion).toBe('v24.2.0')
      expect(result.updateAvailable).toBe(true)
      expect(result.showNodeUnsupportedWarning).toBe(false)

      // Restore original version
      Object.defineProperty(process, 'version', {
        value: originalProcessVersion,
        writable: true,
        configurable: true,
      })
    })

    it('should show no update when on latest v24', async () => {
      // Mock process.version to latest v24
      Object.defineProperty(process, 'version', {
        value: 'v24.2.0',
        writable: true,
        configurable: true,
      })

      vi.spyOn(httpService, 'get').mockReturnValue(of(mockHttpResponse(mockNodeVersions)) as any)

      const result = await statusService.getNodeJsVersionInfo() as NodeJsVersionInfo

      expect(result.currentVersion).toBe('v24.2.0')
      expect(result.latestVersion).toBe('v24.2.0')
      expect(result.updateAvailable).toBe(false)
      expect(result.showNodeUnsupportedWarning).toBe(false)

      // Restore original version
      Object.defineProperty(process, 'version', {
        value: originalProcessVersion,
        writable: true,
        configurable: true,
      })
    })
  })

  describe('Unsupported Node.js versions', () => {
    it('should show warning for Node.js v18', async () => {
      // Mock process.version to v18
      Object.defineProperty(process, 'version', {
        value: 'v18.20.0',
        writable: true,
        configurable: true,
      })

      vi.spyOn(httpService, 'get').mockReturnValue(of(mockHttpResponse(mockNodeVersions)) as any)

      const result = await statusService.getNodeJsVersionInfo() as NodeJsVersionInfo

      expect(result.currentVersion).toBe('v18.20.0')
      expect(result.updateAvailable).toBe(false)
      expect(result.showNodeUnsupportedWarning).toBe(true)

      // Restore original version
      Object.defineProperty(process, 'version', {
        value: originalProcessVersion,
        writable: true,
        configurable: true,
      })
    })

    it('should show warning for Node.js v16', async () => {
      // Mock process.version to v16
      Object.defineProperty(process, 'version', {
        value: 'v16.20.0',
        writable: true,
        configurable: true,
      })

      vi.spyOn(httpService, 'get').mockReturnValue(of(mockHttpResponse(mockNodeVersions)) as any)

      const result = await statusService.getNodeJsVersionInfo() as NodeJsVersionInfo

      expect(result.currentVersion).toBe('v16.20.0')
      expect(result.updateAvailable).toBe(false)
      expect(result.showNodeUnsupportedWarning).toBe(true)

      // Restore original version
      Object.defineProperty(process, 'version', {
        value: originalProcessVersion,
        writable: true,
        configurable: true,
      })
    })
  })

  describe('Error handling', () => {
    it('should handle network errors gracefully', async () => {
      vi.spyOn(httpService, 'get').mockImplementation(() => {
        throw new Error('Network error')
      })

      const result = await statusService.getNodeJsVersionInfo() as NodeJsVersionInfo

      expect(result.currentVersion).toBe(process.version)
      expect(result.latestVersion).toBe(process.version)
      expect(result.updateAvailable).toBe(false)
      expect(result.showNodeUnsupportedWarning).toBe(false)
    })
  })

  describe('Architecture detection', () => {
    it('should correctly detect 64-bit architectures for v24 support', async () => {
      vi.spyOn(httpService, 'get').mockReturnValue(of(mockHttpResponse(mockNodeVersions)) as any)

      const result = await statusService.getNodeJsVersionInfo() as NodeJsVersionInfo

      expect(result).toHaveProperty('architecture')
      expect(result).toHaveProperty('supportsNodeJs24')
      expect(result.architecture).toBe(process.arch)

      const supportedArchitectures = ['x64', 'arm64', 'ppc64', 's390x']
      const expectedSupport = supportedArchitectures.includes(process.arch)
      expect(result.supportsNodeJs24).toBe(expectedSupport)
    })
  })

  describe('Caching', () => {
    it('should cache results for subsequent calls', async () => {
      const spy = vi.spyOn(httpService, 'get').mockReturnValue(of(mockHttpResponse(mockNodeVersions)) as any)

      // First call
      await statusService.getNodeJsVersionInfo()
      expect(spy).toHaveBeenCalledTimes(1)

      // Second call should use cache
      await statusService.getNodeJsVersionInfo()
      expect(spy).toHaveBeenCalledTimes(1)
    })
  })
})
