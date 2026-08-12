/* global NodeJS */
import type { Subscription } from 'rxjs'
import type { Systeminformation } from 'systeminformation'

import type { HomebridgeStatusMatterUpdate } from '../../core/matter/matter.interfaces.js'

import { exec, execSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { cpus, loadavg, platform, userInfo } from 'node:os'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

import { HttpService } from '@nestjs/axios'
import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { readJson, writeJsonSync } from 'fs-extra/esm'
import NodeCache from 'node-cache'
import { firstValueFrom, Subject } from 'rxjs'
import { gt } from 'semver'
import {
  cpuTemperature,
  currentLoad,
  mem,
  networkInterfaceDefault,
  networkInterfaces,
  networkStats,
  osInfo,
  time,
} from 'systeminformation'

import { ConfigService } from '../../core/config/config.service.js'
import { HomebridgeIpcService } from '../../core/homebridge-ipc/homebridge-ipc.service.js'
import { Logger } from '../../core/logger/logger.service.js'
import { isNodeV24SupportedArchitecture } from '../../core/node-version.constants.js'
import { RE_BETA_DATE, RE_STABLE_DATE, RE_TEST_DATE, RE_TRAILING_DATE } from '../../core/regex.constants.js'
import { DockerRelease, DockerReleaseInfo } from '../platform-tools/docker/docker.interfaces.js'
import { PluginsService } from '../plugins/plugins.service.js'
import { ServerService } from '../server/server.service.js'
import {
  HomebridgeStatsResponse,
  HomebridgeStatus,
  HomebridgeStatusUpdate,
} from './status.interfaces.js'

const execAsync = promisify(exec)

@Injectable()
export class StatusService {
  private statusCache = new NodeCache({ stdTTL: 3600 })
  private dashboardLayout: any
  private homebridgeStatus: HomebridgeStatus = HomebridgeStatus.DOWN
  private homebridgeStatusChange = new Subject<HomebridgeStatus>()
  private matterInfo: HomebridgeStatusMatterUpdate = {
    enabled: false,
  }

  private cpuLoadHistory: number[] = []
  private memoryUsageHistory: number[] = []

  private memoryInfo: Systeminformation.MemData

  private rpiGetThrottledMapping = {
    0: 'Under-voltage detected',
    1: 'Arm frequency capped',
    2: 'Currently throttled',
    3: 'Soft temperature limit active',
    16: 'Under-voltage has occurred',
    17: 'Arm frequency capping has occurred',
    18: 'Throttled has occurred',
    19: 'Soft temperature limit has occurred',
  }

  constructor(
    @Inject(HttpService) private readonly httpService: HttpService,
    @Inject(Logger) private readonly logger: Logger,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(PluginsService) private readonly pluginsService: PluginsService,
    @Inject(ServerService) private readonly serverService: ServerService,
    @Inject(HomebridgeIpcService) private readonly homebridgeIpcService: HomebridgeIpcService,
  ) {
    // Systeminformation cpu data is not supported in FreeBSD Jail Shells
    if (platform() === 'freebsd') {
      this.getCpuLoadPoint = this.getCpuLoadPointAlt
      this.getCpuTemp = this.getCpuTempAlt
    }

    if (this.configService.ui.disableServerMetricsMonitoring !== true) {
      setInterval(async () => {
        this.getCpuLoadPoint()
        this.getMemoryUsagePoint()
      }, 10000)
    } else {
      this.logger.debug('Server metrics monitoring disabled.')
    }

    this.homebridgeIpcService.on('serverStatusUpdate', (data: HomebridgeStatusUpdate) => {
      this.homebridgeStatus = data.status

      if (data.status === HomebridgeStatus.DOWN) {
        // Reset Matter info when Homebridge goes down
        this.matterInfo = { enabled: false }
      }

      if (data?.setupUri) {
        this.serverService.setupCode = data.setupUri
        this.serverService.paired = data.paired
      }

      // Store Matter info if provided
      if (data?.matter) {
        this.matterInfo = data.matter
      }

      this.homebridgeStatusChange.next(this.homebridgeStatus)
    })
  }

  /**
   * Looks up the cpu current load % and stores the last 60 points
   */
  private async getCpuLoadPoint() {
    const load = (await currentLoad()).currentLoad
    this.cpuLoadHistory = this.cpuLoadHistory.slice(-60)
    this.cpuLoadHistory.push(load)
  }

  /**
   * Looks up the current memory usage and stores the last 60 points
   */
  private async getMemoryUsagePoint() {
    const memory = await mem()
    this.memoryInfo = memory

    const memoryFreePercent = ((memory.total - memory.available) / memory.total) * 100
    this.memoryUsageHistory = this.memoryUsageHistory.slice(-60)
    this.memoryUsageHistory.push(memoryFreePercent)
  }

  /**
   * Alternative method to get the CPU load on systems that do not support systeminformation.currentLoad
   * This is currently only used on FreeBSD
   */
  private async getCpuLoadPointAlt() {
    const load = (loadavg()[0] * 100 / cpus().length)
    this.cpuLoadHistory = this.cpuLoadHistory.slice(-60)
    this.cpuLoadHistory.push(load)
  }

  /**
   * Get the current CPU temperature using systeminformation.cpuTemperature
   */
  private async getCpuTemp() {
    // An explicitly configured temperature file always wins - auto-detection
    // can read the wrong sensor entirely on some platforms (e.g. Intel macOS
    // reporting ~40°C too high), and previously the override only engaged
    // when auto-detection failed outright, never when it was wrong (#2896)
    if (this.configService.ui.temp) {
      return this.getCpuTempLegacy()
    }

    return cpuTemperature()
  }

  /**
   * The old way of getting the cpu temp
   */
  private async getCpuTempLegacy() {
    try {
      const tempData = await readFile(this.configService.ui.temp, 'utf-8')
      const tempValue = Number.parseFloat(tempData)

      if (!Number.isFinite(tempValue)) {
        throw new TypeError('the file does not contain a number')
      }

      // The configured file may hold either degrees or millidegrees, so pick the
      // unit by magnitude - no cpu runs at 1000°C, and a millidegrees reading is
      // never within 1°C of zero in practice. The comparison ignores the sign so
      // a sub-zero millidegrees reading is not mistaken for degrees (#2896)
      const cpuTemp = Math.abs(tempValue) >= 1000 ? tempValue / 1000 : tempValue
      return {
        main: cpuTemp,
        cores: [],
        max: cpuTemp,
      }
    } catch (e) {
      this.logger.error(`Failed to read temp from ${this.configService.ui.temp} as ${e.message}.`)
      return this.getCpuTempAlt()
    }
  }

  /**
   * Alternative method for CPU temp
   * This is currently only used on FreeBSD and will return null
   */
  private async getCpuTempAlt() {
    return {
      main: -1,
      cores: [],
      max: -1,
    }
  }

  /**
   * Returns the current network usage
   */
  public async getCurrentNetworkUsage(netInterfaces?: string[]): Promise<{ net: Systeminformation.NetworkStatsData, point: number }> {
    if (!netInterfaces || !netInterfaces.length) {
      netInterfaces = [await networkInterfaceDefault()]
    }

    const net = await networkStats(netInterfaces.join(','))

    // TODO: be able to specify in the ui the unit size (i.e. bytes, megabytes, gigabytes)
    const txRxSec = (net[0].tx_sec + net[0].rx_sec) / 1024 / 1024

    // TODO: break out the sent and received figures to two separate stacked graphs
    // (these should ideally be positive/negative mirrored line charts)
    return { net: net[0], point: txRxSec }
  }

  /**
   * Get the current dashboard layout
   */
  public async getDashboardLayout() {
    if (!this.dashboardLayout) {
      try {
        const layout = await readJson(resolve(this.configService.storagePath, '.uix-dashboard.json'))
        this.dashboardLayout = layout
        return layout
      } catch (e) {
        return []
      }
    } else {
      return this.dashboardLayout
    }
  }

  /**
   * Aggregated init payload for the dashboard page — collapses the
   * historical two-event load (`get-dashboard-layout` + an optional
   * `get-raspberry-pi-throttled-status`) into a single WS round-trip.
   * `rpiThrottled` is only attached when the host is actually a Raspberry
   * Pi; non-Pi clients see `{ layout }` and the field is absent.
   */
  public async getDashboardInit(): Promise<{ layout: any, rpiThrottled?: Record<string, boolean> }> {
    const layout = await this.getDashboardLayout()
    if (!this.configService.runningOnRaspberryPi) {
      return { layout }
    }
    try {
      const rpiThrottled = await this.getRaspberryPiThrottledStatus()
      return { layout, rpiThrottled }
    } catch (e) {
      this.logger.debug(`Failed to attach Raspberry Pi throttled status to dashboard init: ${e.message}.`)
      return { layout }
    }
  }

  /**
   * Saves the current dashboard layout
   */
  public async setDashboardLayout(layout: any) {
    writeJsonSync(resolve(this.configService.storagePath, '.uix-dashboard.json'), layout)
    this.dashboardLayout = layout
    return { status: 'ok' }
  }

  /**
   * Returns server CPU Load and temperature information
   */
  public async getServerCpuInfo() {
    // When metrics monitoring is disabled, return an empty result rather than
    // collecting on demand - the dashboard widgets poll this endpoint, which
    // previously kept the metrics alive even with the monitoring turned off (#2934)
    if (this.configService.ui.disableServerMetricsMonitoring === true) {
      return {
        cpuTemperature: { main: -1, cores: [], max: -1 },
        currentLoad: 0,
        cpuLoadHistory: [],
      }
    }

    if (!this.cpuLoadHistory.length) {
      await this.getCpuLoadPoint()
    }

    return {
      cpuTemperature: await this.getCpuTemp(),
      currentLoad: this.cpuLoadHistory.slice(-1)[0],
      cpuLoadHistory: this.cpuLoadHistory,
    }
  }

  /**
   * Returns server Memory usage information
   */
  public async getServerMemoryInfo() {
    // See getServerCpuInfo - no on-demand collection when monitoring is disabled (#2934)
    if (this.configService.ui.disableServerMetricsMonitoring === true) {
      return {
        mem: null,
        memoryUsageHistory: [],
      }
    }

    if (!this.memoryUsageHistory.length) {
      await this.getMemoryUsagePoint()
    }

    return {
      mem: this.memoryInfo,
      memoryUsageHistory: this.memoryUsageHistory,
    }
  }

  /**
   * Returns server and process uptime information
   */
  public async getServerUptimeInfo() {
    return {
      time: time(),
      processUptime: process.uptime(),
    }
  }

  /**
   * Returns Homebridge pairing information
   */
  public async getHomebridgePairingPin() {
    return {
      pin: this.configService.homebridgeConfig.bridge.pin,
      setupUri: await this.serverService.getSetupCode(),
      paired: this.serverService.paired,
      hap: this.getHapInfo(),
      matter: this.matterInfo,
    }
  }

  private getHapInfo() {
    const hap = this.configService.homebridgeConfig.bridge.hap
    // Tolerate both the legacy boolean form (`hap: false`) and the nested
    // object form (`hap: { enabled: false, externalsOnly: true }`). The
    // bridge accessory itself is "enabled" only when the protocol is on
    // AND externalsOnly is not set.
    let enabled = true
    let externalsOnly = false
    if (hap === false) {
      enabled = false
    } else if (typeof hap === 'object' && hap !== null) {
      enabled = hap.enabled !== false
      externalsOnly = hap.externalsOnly === true
    }
    return { enabled, externalsOnly }
  }

  /**
   * Returns Homebridge up/down status from cache
   */
  public async getHomebridgeStatus() {
    return {
      status: this.homebridgeStatus,
      consolePort: this.configService.ui.port,
      name: this.configService.homebridgeConfig.bridge.name,
      port: this.configService.homebridgeConfig.bridge.port,
      pin: this.configService.homebridgeConfig.bridge.pin,
      setupUri: this.serverService.setupCode,
      packageVersion: this.configService.package.version,
      paired: this.serverService.paired,
      hap: this.getHapInfo(),
      matter: this.matterInfo,
    }
  }

  /**
   * Socket Handler - Per Client
   * Start emitting server stats to client
   * @param client
   */
  public async watchStats(client: any) {
    let homebridgeStatusInterval: NodeJS.Timeout
    // Closure-scoped flag flipped by `onEnd`. The subscription callback
    // is async and awaits `getHomebridgeStats()`; without this check
    // the emit could land on a disconnected client (or fire after the
    // socket was reused by another component).
    let disposed = false

    client.emit('homebridge-status', await this.getHomebridgeStats())

    const homebridgeStatusChangeSub: Subscription = this.homebridgeStatusChange.subscribe(async () => {
      const stats = await this.getHomebridgeStats()
      if (disposed) {
        return
      }
      client.emit('homebridge-status', stats)
    })

    // Cleanup on disconnect
    const onEnd = () => {
      disposed = true
      client.removeAllListeners('end')
      client.removeAllListeners('disconnect')

      if (homebridgeStatusInterval) {
        clearInterval(homebridgeStatusInterval)
      }

      homebridgeStatusChangeSub.unsubscribe()
    }

    client.on('end', onEnd.bind(this))
    client.on('disconnect', onEnd.bind(this))
  }

  /**
   * Returns Homebridge Status From Healthcheck
   */
  private async getHomebridgeStats(): Promise<HomebridgeStatsResponse> {
    return {
      consolePort: this.configService.ui.port,
      port: this.configService.homebridgeConfig.bridge.port,
      pin: this.configService.homebridgeConfig.bridge.pin,
      setupUri: await this.serverService.getSetupCode(),
      paired: this.serverService.paired,
      packageVersion: this.configService.package.version,
      status: await this.checkHomebridgeStatus(),
      hap: this.getHapInfo(),
      matter: this.matterInfo,
    }
  }

  /**
   * Check if homebridge is running on the local system
   */
  public async checkHomebridgeStatus() {
    return this.homebridgeStatus
  }

  /**
   * Get / Cache the default interface
   */
  private async getDefaultInterface(): Promise<Systeminformation.NetworkInterfacesData> {
    const cachedResult = this.statusCache.get('defaultInterface') as Systeminformation.NetworkInterfacesData

    if (cachedResult) {
      return cachedResult
    }

    const defaultInterfaceName = await networkInterfaceDefault()
    const defaultInterface = defaultInterfaceName ? (await networkInterfaces()).find(x => x.iface === defaultInterfaceName) : undefined

    if (defaultInterface) {
      this.statusCache.set('defaultInterface', defaultInterface)
    }

    return defaultInterface
  }

  /**
   * Get / Cache the OS Information
   */
  private async getOsInfo(): Promise<Systeminformation.OsData> {
    const cachedResult = this.statusCache.get('osInfo') as Systeminformation.OsData

    if (cachedResult) {
      return cachedResult
    }

    const osInformation = await osInfo()

    this.statusCache.set('osInfo', osInformation, 86400)
    return osInformation
  }

  /**
   * Get / Cache the GLIBC version
   */
  private getGlibcVersion(): string {
    if (platform() !== 'linux') {
      return ''
    }

    const cachedResult = this.statusCache.get('glibcVersion') as string
    if (cachedResult) {
      return cachedResult
    }

    try {
      const glibcVersion = execSync('getconf GNU_LIBC_VERSION 2>/dev/null').toString().split('glibc')[1].trim()
      this.statusCache.set('glibcVersion', glibcVersion, 86400)
      return glibcVersion
    } catch (e) {
      this.logger.debug(`Could not check glibc version as ${e.message}.`)
      return ''
    }
  }

  /**
   * Returns details about this Homebridge server
   */
  public async getHomebridgeServerInfo() {
    return {
      serviceUser: userInfo().username,
      homebridgeConfigJsonPath: this.configService.configPath,
      homebridgeStoragePath: this.configService.storagePath,
      homebridgeInsecureMode: this.configService.homebridgeInsecureMode,
      homebridgeCustomPluginPath: this.configService.customPluginPath,
      homebridgePluginPath: resolve(process.env.UIX_BASE_PATH, '..'),
      homebridgeRunningInDocker: this.configService.runningInDocker,
      homebridgeRunningInSynologyPackage: this.configService.runningInSynologyPackage,
      homebridgeRunningInPackageMode: this.configService.runningInPackageMode,
      nodeVersion: process.version,
      os: await this.getOsInfo(),
      time: time(),
      network: await this.getDefaultInterface() || {},
    }
  }

  /**
   * Return the Homebridge package
   */
  public async getHomebridgeVersion() {
    return this.pluginsService.getHomebridgePackage()
  }

  /**
   * Aggregated payload for the dashboard "Update Info" widget.
   * Replaces 6 separate WS calls + 1 HTTP call on widget load.
   * Per-field null on rejection so a single upstream failure doesn't
   * fail the whole call.
   */
  public async getVersionOverview() {
    const [
      serverInfoResult,
      nodeResult,
      homebridgeResult,
      homebridgeUiResult,
      outOfDatePluginsResult,
      installedPluginsResult,
    ] = await Promise.allSettled([
      this.getHomebridgeServerInfo(),
      this.getNodeVersionInfo(),
      this.pluginsService.getHomebridgePackage(),
      this.pluginsService.getHomebridgeUiPackage(),
      this.pluginsService.getOutOfDatePlugins(),
      this.pluginsService.getInstalledPlugins(),
    ])

    const settled = <T>(result: PromiseSettledResult<T>, label: string, fallback: T): T => {
      if (result.status === 'fulfilled') {
        return result.value
      }
      this.logger.error(`Failed to load ${label} for version overview as ${result.reason?.message ?? result.reason}.`)
      return fallback
    }

    const serverInfo = settled(serverInfoResult, 'server info', null)
    const node = settled(nodeResult, 'node version info', null)
    const homebridge = settled(homebridgeResult, 'homebridge package', null)
    const homebridgeUi = settled(homebridgeUiResult, 'homebridge-ui package', null)
    const outOfDatePlugins = settled(outOfDatePluginsResult, 'out-of-date plugins', [])
    const installedPlugins = settled(installedPluginsResult, 'installed plugins', [])

    // hbV2Ready: every non-ui plugin's `engines.homebridge` accepts a v2 range.
    // Cheap because installedPlugins is already memoised in PluginsService.
    const hbV2Ready = installedPlugins
      .filter(p => p.name !== 'homebridge-config-ui-x')
      .every((p) => {
        const hbEngines = p.engines?.homebridge?.split('||').map(s => s.trim()) || []
        return hbEngines.some(v => v.startsWith('^2') || v.startsWith('>=2'))
      })

    // Only fetch docker details when actually running in docker (matches
    // the frontend's previous gating). Done after the parallel batch so we
    // can read serverInfo. Adds at most one extra round trip on docker.
    let docker = null
    if (serverInfo?.homebridgeRunningInDocker) {
      try {
        docker = await this.getDockerDetails()
      } catch (e) {
        this.logger.error(`Failed to load docker details for version overview as ${e.message}.`)
      }
    }

    return {
      serverInfo,
      node,
      homebridge,
      homebridgeUi,
      outOfDatePlugins,
      docker,
      hbV2Ready,
    }
  }

  /**
   * Clear the Node.js version cache
   * Used when Node.js update policy changes
   */
  public clearNodeJsVersionCache() {
    // Clear cache for all policy variants
    this.statusCache.del('nodeVersion:all')
    this.statusCache.del('nodeVersion:none')
    this.statusCache.del('nodeVersion:major')
  }

  /**
   * Checks the current version of Node.js and compares to the latest LTS
   */
  public async getNodeVersionInfo() {
    // Get the current policy to include in cache key
    const nodeUpdatePolicy = this.configService.getNodeUpdatePolicy()
    const cacheKey = `nodeVersion:${nodeUpdatePolicy}`

    const cachedResult = this.statusCache.get(cacheKey)

    if (cachedResult) {
      return cachedResult
    }

    const isNodeJs24Supported = isNodeV24SupportedArchitecture()

    try {
      const versionList = (await firstValueFrom(this.httpService.get('https://nodejs.org/dist/index.json'))).data

      // Get the newest node v22, v24 and v26
      const latest22 = versionList.filter((x: { version: string }) => x.version.startsWith('v22'))[0]
      const latest24 = versionList.filter((x: { version: string }) => x.version.startsWith('v24'))[0]
      const latest26 = versionList.filter((x: { version: string }) => x.version.startsWith('v26'))[0]

      let updateAvailable = false
      let latestVersion = process.version
      let showNodeUnsupportedWarning = false

      /**
       * NodeJS Version - Minimum GLIBC Version
       *
       *      18            2.28    // Official floor set here: builds moved to RHEL 8.
       *                            // https://nodejs.org/en/blog/announcements/v18-release-announce
       *      20            2.28    // Unchanged from 18; no dedicated migration doc, but bracketed
       *                            // https://github.com/nodejs/node/blob/v20.x/BUILDING.md
       *      22            2.28    // Unchanged from 20.
       *                            // https://github.com/nodejs/node/blob/v22.x/BUILDING.md
       *      24            2.28    // Explicitly confirmed "no change from Node.js 22."
       *                            // Also adds a new libatomic/libatomic1 runtime dependency
       *                            // (separate from glibc) starting at v25.
       *                            // https://nodejs.org/en/blog/migrations/v22-to-v24
       *      26            2.28    // Unchanged from 24.
       *                            // https://github.com/nodejs/node/blob/v26.x/BUILDING.md
       *
       * Summary: the official glibc floor has been 2.28 since Node 18 and has not
       * increased since, for any subsequent version through the current 26 dev
       * branch. There is no 2.31 requirement documented anywhere by Node.js itself.
       * ( I think when they launched 20 it originally had a 2.31 requirement, but that was later rolled back to 2.28. )
       */

      // Behaviour depends on the installed version of node
      switch (process.version.split('.')[0]) {
        case 'v20': {
          // Currently using v20
          if (isNodeJs24Supported) {
            // If node 24 is supported, suggest updating to that
            updateAvailable = true
            latestVersion = latest24.version
          } else {
            // Otherwise, show the option for updating to node 22
            updateAvailable = true
            latestVersion = latest22.version
          }
          break
        }
        case 'v22': {
          // Currently using v22
          if (gt(latest22.version, process.version)) {
            // Check if there is a new minor/patch version available
            updateAvailable = true
            latestVersion = latest22.version
          } else if (isNodeJs24Supported) {
            // If node 24 is supported, suggest updating to that
            updateAvailable = true
            latestVersion = latest24.version
          }
          break
        }
        case 'v24': {
          // Currently using v24 (only possible on 64-bit architectures)
          // Check if there is a new minor/patch version available
          if (gt(latest24.version, process.version)) {
            updateAvailable = true
            latestVersion = latest24.version
          }
          break
        }
        case 'v26': {
          // Currently using v26 (only possible on 64-bit architectures)
          // Check if there is a new minor/patch version available
          if (gt(latest26.version, process.version)) {
            updateAvailable = true
            latestVersion = latest26.version
          }
          break
        }
        default: {
          // Using an unsupported version of node
          showNodeUnsupportedWarning = true
        }
      }

      // Also return the npm version here
      let npmVersion = null
      try {
        const { stdout } = await execAsync('npm --version')
        npmVersion = `v${stdout.trim()}`
      } catch (e) {
        this.logger.debug(`Could not check npm version as ${e.message}.`)
      }

      // Apply node update policy
      const nodeUpdatePolicy = this.configService.getNodeUpdatePolicy()
      let finalUpdateAvailable = updateAvailable
      let finalLatestVersion = latestVersion

      if (nodeUpdatePolicy === 'none') {
        // Hide all Node.js update notifications
        finalUpdateAvailable = false
      } else if (nodeUpdatePolicy === 'major') {
        // Only show updates within the same major version
        const currentMajor = Number.parseInt(process.version.split('.')[0].replace('v', ''), 10)
        const latestMajor = Number.parseInt(latestVersion.split('.')[0].replace('v', ''), 10)

        if (latestMajor > currentMajor) {
          // The suggested version is a major upgrade, find the latest within current major
          const latestInCurrentMajor = versionList
            .filter((x: { version: string }) => x.version.startsWith(`v${currentMajor}`))
            .sort((a: { version: string }, b: { version: string }) => {
              // Sort by version descending
              return b.version.localeCompare(a.version, undefined, { numeric: true, sensitivity: 'base' })
            })[0]

          if (latestInCurrentMajor && gt(latestInCurrentMajor.version, process.version)) {
            // There's a newer version in the current major
            finalLatestVersion = latestInCurrentMajor.version
            finalUpdateAvailable = true
          } else {
            // No newer version in current major
            finalUpdateAvailable = false
          }
        }
        // If latestMajor === currentMajor, the existing latestVersion is already correct
      }

      const versionInformation = {
        currentVersion: process.version,
        latestVersion: finalLatestVersion,
        updateAvailable: finalUpdateAvailable,
        showNodeUnsupportedWarning,
        installPath: dirname(process.execPath),
        npmVersion,
        architecture: process.arch,
        supportsNodeJs24: isNodeJs24Supported,
      }

      this.statusCache.set(cacheKey, versionInformation, 86400)
      return versionInformation
    } catch (e) {
      this.logger.log(`Failed to check for Node.js version updates (check your internet connection) as ${e.message}.`)
      const versionInformation = {
        currentVersion: process.version,
        latestVersion: process.version,
        updateAvailable: false,
        showNodeUnsupportedWarning: false,
        architecture: process.arch,
        supportsNodeJs24: isNodeJs24Supported,
      }
      this.statusCache.set(cacheKey, versionInformation, 3600)
      return versionInformation
    }
  }

  /**
   * Returns information about the current state of the Raspberry Pi
   */
  public async getRaspberryPiThrottledStatus() {
    if (!this.configService.runningOnRaspberryPi) {
      throw new BadRequestException('This command is only available on Raspberry Pi')
    }

    const output = {}

    for (const bit of Object.keys(this.rpiGetThrottledMapping)) {
      output[this.rpiGetThrottledMapping[bit]] = false
    }

    try {
      const { stdout } = await execAsync('vcgencmd get_throttled')
      const throttledHex = Number.parseInt(stdout.trim().replace('throttled=', ''))

      if (!Number.isNaN(throttledHex)) {
        for (const bit of Object.keys(this.rpiGetThrottledMapping)) {
          output[this.rpiGetThrottledMapping[bit]] = !!((throttledHex >> Number.parseInt(bit, 10)) & 1)
        }
      }
    } catch (e) {
      this.logger.debug(`Could not check vcgencmd get_throttled as ${e.message}.`)
    }

    return output
  }

  /**
   * Fetches Docker package details, including version information, release body, and system details.
   * Accounts for version tag formats: YYYY-MM-DD (stable), beta-YYYY-MM-DD or test-YYYY-MM-DD (test).
   * If currentVersion is beta/test, latestVersion is the latest beta/test version; otherwise, it's the latest stable.
   * @returns A promise resolving to the Docker details object.
   */
  public async getDockerDetails() {
    const currentVersion = process.env.DOCKER_HOMEBRIDGE_VERSION
    let latestVersion: string | null = null
    let latestReleaseBody = ''
    let updateAvailable = false

    try {
      const { releases, rawReleases } = await this.getRecentReleases()

      // Determine the type of currentVersion and select the appropriate latest version
      if (currentVersion) {
        const lowerCurrentVersion = currentVersion.toLowerCase()
        let targetReleases: DockerReleaseInfo[] = []

        if (lowerCurrentVersion.startsWith('beta-')) {
          // Current version is beta; select latest beta version
          targetReleases = releases
            .filter(release => release.testTag === 'beta' && RE_BETA_DATE.test(release.version))
            .sort((a, b) => b.version.localeCompare(a.version)) // Sort by date descending
          latestVersion = targetReleases[0]?.version || null
        } else if (lowerCurrentVersion.startsWith('test-')) {
          // Current version is test; select latest test version
          targetReleases = releases
            .filter(release => release.testTag === 'test' && RE_TEST_DATE.test(release.version))
            .sort((a, b) => b.version.localeCompare(a.version)) // Sort by date descending
          latestVersion = targetReleases[0]?.version || null
        } else {
          // Current version is stable or invalid; select latest stable version
          const stableRelease = releases.find(release => release.isLatestStable)
          latestVersion = stableRelease?.version || null
        }

        if (currentVersion && latestVersion) {
          // Compare versions as dates if they match the expected format
          if (RE_TRAILING_DATE.test(currentVersion) && RE_TRAILING_DATE.test(latestVersion)) {
            const currentDate = new Date(currentVersion.match(RE_TRAILING_DATE)![0])
            const latestDate = new Date(latestVersion.match(RE_TRAILING_DATE)![0])
            updateAvailable = latestDate > currentDate
          } else {
            // Fallback to string comparison
            updateAvailable = currentVersion !== latestVersion
          }
        }
      } else {
        // No currentVersion; default to latest stable
        const stableRelease = releases.find(release => release.isLatestStable)
        latestVersion = stableRelease?.version || null
      }

      // Fetch the release body for the latestVersion
      if (latestVersion) {
        const rawRelease = rawReleases.find(r => r.tag_name === latestVersion)
        latestReleaseBody = rawRelease?.body || ''
      }
    } catch (error) {
      console.error('Failed to fetch Docker details:', error instanceof Error ? error.message : error)
    }

    return {
      currentVersion,
      latestVersion,
      latestReleaseBody,
      updateAvailable,
    }
  }

  private readonly DOCKER_GITHUB_API_URL = 'https://api.github.com/repos/homebridge/docker-homebridge/releases'

  /**
   * Fetches the most recent releases (up to 100) of the homebridge/docker-homebridge package from GitHub,
   * tagging test versions (tags starting with 'beta-' or 'test-') and the latest stable version (YYYY-MM-DD format).
   * Includes a testTag field for test versions.
   * @returns A promise resolving to an object with processed releases and raw release data, or empty arrays if an error occurs.
   */
  public async getRecentReleases(): Promise<{ releases: DockerReleaseInfo[], rawReleases: DockerRelease[] }> {
    try {
      // Fetch the first page of up to 100 releases
      const response = await fetch(`${this.DOCKER_GITHUB_API_URL}?per_page=100`, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          // Optional: Add GitHub token for higher rate limits
          // 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
        },
      })

      if (!response.ok) {
        console.error(`GitHub API error: ${response.status} ${response.statusText}`)
        return { releases: [], rawReleases: [] }
      }

      const data: DockerRelease[] = await response.json()

      if (!Array.isArray(data)) {
        console.error('Invalid response from GitHub API: Expected an array')
        return { releases: [], rawReleases: [] }
      }

      // Find the latest stable release by sorting YYYY-MM-DD tags
      const stableReleases = data
        .filter(release => RE_STABLE_DATE.test(release.tag_name)) // Stable: YYYY-MM-DD
        .sort((a, b) => b.tag_name.localeCompare(a.tag_name)) // Sort descending (most recent first)
      const latestStableTag = stableReleases[0]?.tag_name || null

      const releases = data.map((release) => {
        const tagName = release.tag_name.toLowerCase()
        let testTag: 'beta' | 'test' | null = null
        if (tagName.startsWith('beta-')) {
          testTag = 'beta'
        } else if (tagName.startsWith('test-')) {
          testTag = 'test'
        }

        return {
          version: release.tag_name,
          publishedAt: release.published_at,
          isPrerelease: release.prerelease,
          isTest: testTag !== null,
          testTag,
          isLatestStable: release.tag_name === latestStableTag,
        }
      })

      return { releases, rawReleases: data }
    } catch (error) {
      console.error('Failed to fetch docker-homebridge releases:', error instanceof Error ? error.message : error)
      return { releases: [], rawReleases: [] }
    }
  }
}
