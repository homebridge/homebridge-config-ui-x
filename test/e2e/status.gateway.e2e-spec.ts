import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'

import { EventEmitter } from 'node:events'
import { resolve } from 'node:path'
import process from 'node:process'

import { HttpService } from '@nestjs/axios'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { copy } from 'fs-extra'
import { of } from 'rxjs'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConfigService } from '../../src/core/config/config.service.js'
import { HomebridgeIpcService } from '../../src/core/homebridge-ipc/homebridge-ipc.service.js'
import { PluginsService } from '../../src/modules/plugins/plugins.service.js'
import { StatusGateway } from '../../src/modules/status/status.gateway.js'
import { StatusModule } from '../../src/modules/status/status.module.js'
import { StatusService } from '../../src/modules/status/status.service.js'

describe('StatusGateway (e2e)', () => {
  let app: NestFastifyApplication

  let statusGateway: StatusGateway
  let statusService: StatusService
  let pluginsService: PluginsService
  let configService: ConfigService
  let httpService: HttpService
  let ipcService: HomebridgeIpcService
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

    httpService = new HttpService()

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [StatusModule],
    }).overrideProvider(HttpService).useValue(httpService).compile()

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter())

    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    statusGateway = app.get(StatusGateway)
    statusService = app.get(StatusService)
    pluginsService = app.get(PluginsService)
    configService = app.get(ConfigService)
    ipcService = app.get(HomebridgeIpcService)
  })

  beforeEach(async () => {
    if (client) {
      client.emit('disconnect')
    }

    vi.resetAllMocks()

    client = new EventEmitter()
    vi.spyOn(client, 'emit')
    vi.spyOn(client, 'on')
  })

  describe('Dashboard Layout', () => {
    it('should save and return dashboard layout', async () => {
      const layout = [{ widget: 'cpu', order: 1 }, { widget: 'memory', order: 2 }]

      const setResult = await statusGateway.setDashboardLayout(client, layout)
      expect(setResult).toEqual({ status: 'ok' })

      const getResult = await statusGateway.getDashboardLayout()
      expect(getResult).toEqual(layout)
    })

    it('should return layout from cache after being set', async () => {
      // The layout was set in the previous test and cached in memory
      const result = await statusGateway.getDashboardLayout()
      expect(result).toBeDefined()
      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('Dashboard Init', () => {
    const mockLayout = [{ widget: 'cpu', order: 1 }] as any

    it('returns just the layout on non-Raspberry-Pi hosts', async () => {
      vi.spyOn(statusService, 'getDashboardLayout').mockResolvedValue(mockLayout)
      Object.defineProperty(configService, 'runningOnRaspberryPi', { value: false, configurable: true })

      const result = await statusGateway.getDashboardInit() as any
      expect(result.layout).toEqual(mockLayout)
      expect(result).not.toHaveProperty('rpiThrottled')
    })

    it('attaches rpiThrottled on Raspberry-Pi hosts', async () => {
      const mockRpi = { underVoltage: false, throttled: false }
      vi.spyOn(statusService, 'getDashboardLayout').mockResolvedValue(mockLayout)
      vi.spyOn(statusService, 'getRaspberryPiThrottledStatus').mockResolvedValue(mockRpi as any)
      Object.defineProperty(configService, 'runningOnRaspberryPi', { value: true, configurable: true })

      const result = await statusGateway.getDashboardInit() as any
      expect(result.layout).toEqual(mockLayout)
      expect(result.rpiThrottled).toEqual(mockRpi)
    })

    it('swallows Raspberry-Pi IPC failures and still returns the layout', async () => {
      vi.spyOn(statusService, 'getDashboardLayout').mockResolvedValue(mockLayout)
      vi.spyOn(statusService, 'getRaspberryPiThrottledStatus').mockRejectedValue(new Error('vcgencmd down'))
      Object.defineProperty(configService, 'runningOnRaspberryPi', { value: true, configurable: true })

      const result = await statusGateway.getDashboardInit() as any
      expect(result.layout).toEqual(mockLayout)
      expect(result).not.toHaveProperty('rpiThrottled')
    })

    it('returns a WsException when layout retrieval itself fails', async () => {
      vi.spyOn(statusService, 'getDashboardInit').mockRejectedValue(new Error('layout down'))

      const result = await statusGateway.getDashboardInit()
      expect((result as any).message).toBe('layout down')
    })
  })

  describe('Version Checks', () => {
    it('should return homebridge version info', async () => {
      const mockPackage = { name: 'homebridge', installedVersion: '1.7.0', latestVersion: '1.8.0', updateAvailable: true }
      vi.spyOn(pluginsService, 'getHomebridgePackage').mockResolvedValue(mockPackage as any)

      const result = await statusGateway.homebridgeVersionCheck()
      expect(result).toEqual(mockPackage)
    })

    it('should return WsException when homebridge version check fails', async () => {
      vi.spyOn(pluginsService, 'getHomebridgePackage').mockRejectedValue(new Error('npm error'))

      const result = await statusGateway.homebridgeVersionCheck()
      expect((result as any).message).toBe('npm error')
    })

    it('should return homebridge UI version info', async () => {
      const mockPackage = { name: 'homebridge-config-ui-x', installedVersion: '5.0.0' }
      vi.spyOn(pluginsService, 'getHomebridgeUiPackage').mockResolvedValue(mockPackage as any)

      const result = await statusGateway.homebridgeUiVersionCheck()
      expect(result).toEqual(mockPackage)
    })

    it('should return WsException when UI version check fails', async () => {
      vi.spyOn(pluginsService, 'getHomebridgeUiPackage').mockRejectedValue(new Error('ui error'))

      const result = await statusGateway.homebridgeUiVersionCheck()
      expect((result as any).message).toBe('ui error')
    })

    it('should return npm version info', async () => {
      const mockPackage = { name: 'npm', installedVersion: '9.0.0' }
      vi.spyOn(pluginsService, 'getNpmPackage').mockResolvedValue(mockPackage as any)

      const result = await statusGateway.npmVersionCheck()
      expect(result).toEqual(mockPackage)
    })

    it('should return WsException when npm version check fails', async () => {
      vi.spyOn(pluginsService, 'getNpmPackage').mockRejectedValue(new Error('npm error'))

      const result = await statusGateway.npmVersionCheck()
      expect((result as any).message).toBe('npm error')
    })

    it('should return nodejs version info', async () => {
      const nodeData = [
        { version: 'v24.11.0', lts: 'Krypton' },
        { version: 'v22.21.1', lts: 'Jod' },
        { version: 'v20.19.5', lts: 'Iron' },
      ]

      const response: AxiosResponse<any> = {
        data: nodeData,
        headers: {},
        config: { url: 'https://nodejs.org/dist/index.json' } as InternalAxiosRequestConfig,
        status: 200,
        statusText: 'OK',
      }

      vi.spyOn(httpService, 'get').mockReturnValue(of(response) as any)

      const result = await statusGateway.nodeVersionCheck()
      expect(result).toHaveProperty('currentVersion')
      expect(result).toHaveProperty('latestVersion')
      expect(result).toHaveProperty('updateAvailable')
      expect((result as any).currentVersion).toBe(process.version)
    })

    it('should return WsException when nodejs version check fails', async () => {
      vi.spyOn(statusService, 'getNodeVersionInfo').mockRejectedValue(new Error('node error'))

      const result = await statusGateway.nodeVersionCheck()
      expect((result as any).message).toBe('node error')
    })

    it('should clear nodejs version cache and return success', () => {
      const result = statusGateway.clearNodeJsVersionCache()
      expect(result).toEqual({ success: true })
    })
  })

  describe('Docker Version Check', () => {
    it('should return docker version info', async () => {
      const mockDetails = { currentVersion: '2024-01-01', latestVersion: '2024-02-01', updateAvailable: true }
      vi.spyOn(statusService, 'getDockerDetails').mockResolvedValue(mockDetails as any)

      const result = await statusGateway.dockerVersionCheck()
      expect(result).toEqual(mockDetails)
    })

    it('should return WsException when docker version check fails', async () => {
      vi.spyOn(statusService, 'getDockerDetails').mockRejectedValue(new Error('docker error'))

      const result = await statusGateway.dockerVersionCheck()
      expect((result as any).message).toBe('docker error')
    })
  })

  describe('Out of Date Plugins', () => {
    it('should return out of date plugins list', async () => {
      const mockPlugins = [{ name: 'homebridge-test', installedVersion: '1.0.0', latestVersion: '2.0.0' }]
      vi.spyOn(pluginsService, 'getOutOfDatePlugins').mockResolvedValue(mockPlugins as any)

      const result = await statusGateway.getOutOfDatePlugins()
      expect(result).toEqual(mockPlugins)
    })

    it('should return WsException when out of date plugins check fails', async () => {
      vi.spyOn(pluginsService, 'getOutOfDatePlugins').mockRejectedValue(new Error('plugins error'))

      const result = await statusGateway.getOutOfDatePlugins()
      expect((result as any).message).toBe('plugins error')
    })
  })

  describe('Version Overview', () => {
    const mockServerInfo = {
      serviceUser: 'tester',
      homebridgeRunningInDocker: false,
      nodeVersion: 'v22.0.0',
    } as any
    const mockNode = { currentVersion: 'v22.0.0', latestVersion: 'v22.0.0', updateAvailable: false } as any
    const mockHomebridge = { name: 'homebridge', installedVersion: '2.0.0', latestVersion: '2.0.0', updateAvailable: false } as any
    const mockHomebridgeUi = { name: 'homebridge-config-ui-x', installedVersion: '5.0.0' } as any
    const mockOutOfDatePlugins = [{ name: 'homebridge-test', installedVersion: '1.0.0', latestVersion: '2.0.0' }] as any
    const mockHbV2ReadyPlugins = [
      { name: 'homebridge-config-ui-x', engines: { homebridge: '^1.6.0 || ^2.0.0' } },
      { name: 'homebridge-foo', engines: { homebridge: '^2.0.0' } },
      { name: 'homebridge-bar', engines: { homebridge: '>=2.0.0-beta.0' } },
    ] as any

    const mockAllForHappyPath = () => {
      vi.spyOn(statusService, 'getHomebridgeServerInfo').mockResolvedValue(mockServerInfo)
      vi.spyOn(statusService, 'getNodeVersionInfo').mockResolvedValue(mockNode)
      vi.spyOn(pluginsService, 'getHomebridgePackage').mockResolvedValue(mockHomebridge)
      vi.spyOn(pluginsService, 'getHomebridgeUiPackage').mockResolvedValue(mockHomebridgeUi)
      vi.spyOn(pluginsService, 'getOutOfDatePlugins').mockResolvedValue(mockOutOfDatePlugins)
      vi.spyOn(pluginsService, 'getInstalledPlugins').mockResolvedValue(mockHbV2ReadyPlugins)
    }

    it('should return all version fields on happy path', async () => {
      mockAllForHappyPath()

      const result = await statusGateway.getVersionOverview() as any
      expect(result.serverInfo).toEqual(mockServerInfo)
      expect(result.node).toEqual(mockNode)
      expect(result.homebridge).toEqual(mockHomebridge)
      expect(result.homebridgeUi).toEqual(mockHomebridgeUi)
      expect(result.outOfDatePlugins).toEqual(mockOutOfDatePlugins)
      expect(result.docker).toBeNull()
      expect(result.hbV2Ready).toBe(true)
    })

    it('should return docker details when running in docker', async () => {
      const mockDocker = { currentVersion: '2024-01-01', latestVersion: '2024-02-01', updateAvailable: true, latestReleaseBody: '' }
      vi.spyOn(statusService, 'getHomebridgeServerInfo').mockResolvedValue({ ...mockServerInfo, homebridgeRunningInDocker: true })
      vi.spyOn(statusService, 'getNodeVersionInfo').mockResolvedValue(mockNode)
      vi.spyOn(pluginsService, 'getHomebridgePackage').mockResolvedValue(mockHomebridge)
      vi.spyOn(pluginsService, 'getHomebridgeUiPackage').mockResolvedValue(mockHomebridgeUi)
      vi.spyOn(pluginsService, 'getOutOfDatePlugins').mockResolvedValue(mockOutOfDatePlugins)
      vi.spyOn(pluginsService, 'getInstalledPlugins').mockResolvedValue(mockHbV2ReadyPlugins)
      vi.spyOn(statusService, 'getDockerDetails').mockResolvedValue(mockDocker as any)

      const result = await statusGateway.getVersionOverview() as any
      expect(result.docker).toEqual(mockDocker)
    })

    it('should null individual fields when their source rejects', async () => {
      vi.spyOn(statusService, 'getHomebridgeServerInfo').mockResolvedValue(mockServerInfo)
      vi.spyOn(statusService, 'getNodeVersionInfo').mockRejectedValue(new Error('node down'))
      vi.spyOn(pluginsService, 'getHomebridgePackage').mockResolvedValue(mockHomebridge)
      vi.spyOn(pluginsService, 'getHomebridgeUiPackage').mockRejectedValue(new Error('ui down'))
      vi.spyOn(pluginsService, 'getOutOfDatePlugins').mockRejectedValue(new Error('outdated down'))
      vi.spyOn(pluginsService, 'getInstalledPlugins').mockResolvedValue(mockHbV2ReadyPlugins)

      const result = await statusGateway.getVersionOverview() as any
      expect(result.node).toBeNull()
      expect(result.homebridgeUi).toBeNull()
      expect(result.outOfDatePlugins).toEqual([])
      // Survivors still present
      expect(result.serverInfo).toEqual(mockServerInfo)
      expect(result.homebridge).toEqual(mockHomebridge)
      expect(result.hbV2Ready).toBe(true)
    })

    it('should return hbV2Ready=false when any non-ui plugin lacks a v2 engine constraint', async () => {
      vi.spyOn(statusService, 'getHomebridgeServerInfo').mockResolvedValue(mockServerInfo)
      vi.spyOn(statusService, 'getNodeVersionInfo').mockResolvedValue(mockNode)
      vi.spyOn(pluginsService, 'getHomebridgePackage').mockResolvedValue(mockHomebridge)
      vi.spyOn(pluginsService, 'getHomebridgeUiPackage').mockResolvedValue(mockHomebridgeUi)
      vi.spyOn(pluginsService, 'getOutOfDatePlugins').mockResolvedValue([])
      vi.spyOn(pluginsService, 'getInstalledPlugins').mockResolvedValue([
        { name: 'homebridge-foo', engines: { homebridge: '^2.0.0' } },
        { name: 'homebridge-bar', engines: { homebridge: '^1.6.0' } },
      ] as any)

      const result = await statusGateway.getVersionOverview() as any
      expect(result.hbV2Ready).toBe(false)
    })

    it('should ignore homebridge-config-ui-x in hbV2Ready computation', async () => {
      vi.spyOn(statusService, 'getHomebridgeServerInfo').mockResolvedValue(mockServerInfo)
      vi.spyOn(statusService, 'getNodeVersionInfo').mockResolvedValue(mockNode)
      vi.spyOn(pluginsService, 'getHomebridgePackage').mockResolvedValue(mockHomebridge)
      vi.spyOn(pluginsService, 'getHomebridgeUiPackage').mockResolvedValue(mockHomebridgeUi)
      vi.spyOn(pluginsService, 'getOutOfDatePlugins').mockResolvedValue([])
      vi.spyOn(pluginsService, 'getInstalledPlugins').mockResolvedValue([
        // UI plugin without a v2 range — must NOT block hbV2Ready
        { name: 'homebridge-config-ui-x', engines: { homebridge: '^1.6.0' } },
        { name: 'homebridge-foo', engines: { homebridge: '^2.0.0' } },
      ] as any)

      const result = await statusGateway.getVersionOverview() as any
      expect(result.hbV2Ready).toBe(true)
    })

    it('should return WsException when the aggregator itself throws', async () => {
      vi.spyOn(statusService, 'getVersionOverview').mockRejectedValue(new Error('overview error'))

      const result = await statusGateway.getVersionOverview()
      expect((result as any).message).toBe('overview error')
    })
  })

  describe('Server Info', () => {
    it('should return homebridge server info', async () => {
      const result = await statusGateway.getHomebridgeServerInfo()
      expect(result).toHaveProperty('serviceUser')
      expect(result).toHaveProperty('homebridgeStoragePath')
      expect(result).toHaveProperty('nodeVersion')
      expect(result).toHaveProperty('os')
      expect(result).toHaveProperty('time')
      expect(result).toHaveProperty('network')
    }, 30000)

    it('should return WsException when server info fails', async () => {
      vi.spyOn(statusService, 'getHomebridgeServerInfo').mockRejectedValue(new Error('server error'))

      const result = await statusGateway.getHomebridgeServerInfo()
      expect((result as any).message).toBe('server error')
    })

    it('should return CPU info', async () => {
      const result = await statusGateway.getServerCpuInfo()
      expect(result).toHaveProperty('cpuTemperature')
      expect(result).toHaveProperty('cpuLoadHistory')
    }, 30000)

    it('should return memory info', async () => {
      const result = await statusGateway.getServerMemoryInfo()
      expect(result).toHaveProperty('mem')
      expect(result).toHaveProperty('memoryUsageHistory')
    }, 30000)

    it('should return empty CPU info when metrics monitoring is disabled', async () => {
      configService.ui.disableServerMetricsMonitoring = true
      try {
        const result = await statusGateway.getServerCpuInfo()
        expect((result as any).cpuLoadHistory).toEqual([])
        expect((result as any).cpuTemperature).toEqual({ main: -1, cores: [], max: -1 })
      } finally {
        delete configService.ui.disableServerMetricsMonitoring
      }
    })

    it('should return empty memory info when metrics monitoring is disabled', async () => {
      configService.ui.disableServerMetricsMonitoring = true
      try {
        const result = await statusGateway.getServerMemoryInfo()
        expect((result as any).mem).toBeNull()
        expect((result as any).memoryUsageHistory).toEqual([])
      } finally {
        delete configService.ui.disableServerMetricsMonitoring
      }
    })

    it('should return network info with default interface', async () => {
      const result = await statusGateway.getServerNetworkInfo(client, { netInterfaces: [] })
      expect(result).toHaveProperty('net')
      expect(result).toHaveProperty('point')
    }, 30000)

    it('should return uptime info', async () => {
      const result = await statusGateway.getServerUptimeInfo()
      expect(result).toHaveProperty('time')
      expect(result).toHaveProperty('processUptime')
      expect(typeof (result as any).processUptime).toBe('number')
    })
  })

  describe('Homebridge Status', () => {
    it('should return homebridge pairing pin', async () => {
      const result = await statusGateway.getHomebridgePairingPin()
      expect(result).toHaveProperty('pin')
      expect(result).toHaveProperty('paired')
      expect(result).toHaveProperty('matter')
      expect((result as any).pin).toBe(configService.homebridgeConfig.bridge.pin)
    })

    it('should return WsException when pairing pin fails', async () => {
      vi.spyOn(statusService, 'getHomebridgePairingPin').mockRejectedValue(new Error('pin error'))

      const result = await statusGateway.getHomebridgePairingPin()
      expect((result as any).message).toBe('pin error')
    })

    it('should return homebridge status', async () => {
      const result = await statusGateway.getHomebridgeStatus()
      expect(result).toHaveProperty('status')
      expect(result).toHaveProperty('consolePort')
      expect(result).toHaveProperty('name')
      expect(result).toHaveProperty('port')
      expect(result).toHaveProperty('pin')
      expect(result).toHaveProperty('packageVersion')
    })

    it('should return WsException when homebridge status fails', async () => {
      vi.spyOn(statusService, 'getHomebridgeStatus').mockRejectedValue(new Error('status error'))

      const result = await statusGateway.getHomebridgeStatus()
      expect((result as any).message).toBe('status error')
    })
  })

  describe('Monitor Server Status', () => {
    it('should start watching stats and emit initial status', async () => {
      await statusGateway.serverStatus(client)

      // watchStats is async internally - wait for it to emit
      await new Promise(res => setTimeout(res, 100))

      expect(client.emit).toHaveBeenCalledWith('homebridge-status', expect.objectContaining({
        status: expect.any(String),
        pin: expect.any(String),
      }))
    })

    it('should emit updated status when homebridge status changes', async () => {
      await statusGateway.serverStatus(client)
      await new Promise(res => setTimeout(res, 100))

      // Clear initial emit calls
      vi.mocked(client.emit).mockClear()

      // Simulate status change
      ipcService.emit('serverStatusUpdate', { status: 'up' })

      await new Promise(res => setTimeout(res, 100))

      expect(client.emit).toHaveBeenCalledWith('homebridge-status', expect.objectContaining({
        status: 'up',
      }))
    })

    it('should clean up on client disconnect', async () => {
      await statusGateway.serverStatus(client)
      await new Promise(res => setTimeout(res, 100))

      // Disconnect
      client.emit('disconnect')

      // Clear emit calls
      vi.mocked(client.emit).mockClear()

      // Emit another status change - should NOT reach client
      ipcService.emit('serverStatusUpdate', { status: 'down' })

      await new Promise(res => setTimeout(res, 100))

      // The 'homebridge-status' event should not have been emitted after disconnect
      const homebridgeStatusCalls = vi.mocked(client.emit).mock.calls.filter(
        call => call[0] === 'homebridge-status',
      )
      expect(homebridgeStatusCalls).toHaveLength(0)
    })
  })

  describe('Raspberry Pi Throttled Status', () => {
    it('should return WsException when not on Raspberry Pi', async () => {
      // Earlier tests in this file set runningOnRaspberryPi=true via
      // Object.defineProperty without cleanup, so explicitly assert the
      // non-Pi state here rather than relying on the default value.
      Object.defineProperty(configService, 'runningOnRaspberryPi', { value: false, configurable: true })

      const result = await statusGateway.getRaspberryPiThrottledStatus()
      // Not running on a Raspberry Pi in test, so should return WsException
      expect((result as any).message).toBeDefined()
    })
  })

  describe('Docker Version Checking', () => {
    const mockReleases = [
      { tag_name: '2025-12-15', published_at: '2025-12-15T00:00:00Z', prerelease: false, body: 'Stable release notes' },
      { tag_name: '2025-12-01', published_at: '2025-12-01T00:00:00Z', prerelease: false, body: 'Older stable' },
      { tag_name: 'beta-2025-12-20', published_at: '2025-12-20T00:00:00Z', prerelease: true, body: 'Beta notes' },
      { tag_name: 'test-2025-12-18', published_at: '2025-12-18T00:00:00Z', prerelease: true, body: 'Test notes' },
    ]

    it('getRecentReleases should parse and tag releases correctly', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => mockReleases,
      } as Response)

      const { releases, rawReleases } = await statusService.getRecentReleases()

      expect(rawReleases).toHaveLength(4)
      expect(releases).toHaveLength(4)

      // Check stable tagging
      const stable = releases.find(r => r.version === '2025-12-15')
      expect(stable.isLatestStable).toBe(true)
      expect(stable.isTest).toBe(false)

      // Check beta tagging
      const beta = releases.find(r => r.version === 'beta-2025-12-20')
      expect(beta.testTag).toBe('beta')
      expect(beta.isTest).toBe(true)

      // Check test tagging
      const test = releases.find(r => r.version === 'test-2025-12-18')
      expect(test.testTag).toBe('test')
      expect(test.isTest).toBe(true)

      vi.mocked(globalThis.fetch).mockRestore()
    })

    it('getRecentReleases should return empty on non-200 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      } as Response)

      const { releases, rawReleases } = await statusService.getRecentReleases()

      expect(releases).toEqual([])
      expect(rawReleases).toEqual([])

      vi.mocked(globalThis.fetch).mockRestore()
    })

    it('getRecentReleases should return empty on invalid response data', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => 'not an array',
      } as Response)

      const { releases, rawReleases } = await statusService.getRecentReleases()

      expect(releases).toEqual([])
      expect(rawReleases).toEqual([])

      vi.mocked(globalThis.fetch).mockRestore()
    })

    it('getRecentReleases should return empty on fetch error', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))

      const { releases, rawReleases } = await statusService.getRecentReleases()

      expect(releases).toEqual([])
      expect(rawReleases).toEqual([])

      vi.mocked(globalThis.fetch).mockRestore()
    })

    it('getDockerDetails should return no update when no DOCKER_HOMEBRIDGE_VERSION set', async () => {
      delete process.env.DOCKER_HOMEBRIDGE_VERSION

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => mockReleases,
      } as Response)

      const result = await statusService.getDockerDetails()

      expect(result.currentVersion).toBeUndefined()
      expect(result.latestVersion).toBe('2025-12-15') // latest stable
      expect(result.updateAvailable).toBe(false)

      vi.mocked(globalThis.fetch).mockRestore()
    })

    it('getDockerDetails should detect stable update available', async () => {
      process.env.DOCKER_HOMEBRIDGE_VERSION = '2025-12-01'

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => mockReleases,
      } as Response)

      const result = await statusService.getDockerDetails()

      expect(result.currentVersion).toBe('2025-12-01')
      expect(result.latestVersion).toBe('2025-12-15')
      expect(result.updateAvailable).toBe(true)
      expect(result.latestReleaseBody).toBe('Stable release notes')

      delete process.env.DOCKER_HOMEBRIDGE_VERSION
      vi.mocked(globalThis.fetch).mockRestore()
    })

    it('getDockerDetails should detect no update when on latest stable', async () => {
      process.env.DOCKER_HOMEBRIDGE_VERSION = '2025-12-15'

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => mockReleases,
      } as Response)

      const result = await statusService.getDockerDetails()

      expect(result.currentVersion).toBe('2025-12-15')
      expect(result.updateAvailable).toBe(false)

      delete process.env.DOCKER_HOMEBRIDGE_VERSION
      vi.mocked(globalThis.fetch).mockRestore()
    })

    it('getDockerDetails should use beta channel when on beta', async () => {
      process.env.DOCKER_HOMEBRIDGE_VERSION = 'beta-2025-12-10'

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => mockReleases,
      } as Response)

      const result = await statusService.getDockerDetails()

      expect(result.currentVersion).toBe('beta-2025-12-10')
      expect(result.latestVersion).toBe('beta-2025-12-20')
      expect(result.updateAvailable).toBe(true)

      delete process.env.DOCKER_HOMEBRIDGE_VERSION
      vi.mocked(globalThis.fetch).mockRestore()
    })

    it('getDockerDetails should handle fetch error gracefully', async () => {
      process.env.DOCKER_HOMEBRIDGE_VERSION = '2025-12-01'

      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))

      const result = await statusService.getDockerDetails()

      expect(result.currentVersion).toBe('2025-12-01')
      expect(result.latestVersion).toBeNull()
      expect(result.updateAvailable).toBe(false)

      delete process.env.DOCKER_HOMEBRIDGE_VERSION
      vi.mocked(globalThis.fetch).mockRestore()
    })
  })

  afterAll(async () => {
    await app.close()
  })
})
