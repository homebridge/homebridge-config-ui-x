/* global NodeJS */
import type { Subscription } from 'rxjs'
import type { Systeminformation } from 'systeminformation'

import { exec, execSync } from 'node:child_process'
import { cpus, loadavg, platform, userInfo } from 'node:os'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

import { HttpService } from '@nestjs/axios'
import { BadRequestException, Injectable } from '@nestjs/common'
import { readFile, readJson, writeJsonSync } from 'fs-extra'
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

import { ConfigService } from '../../core/config/config.service'
import { HomebridgeIpcService } from '../../core/homebridge-ipc/homebridge-ipc.service'
import { Logger } from '../../core/logger/logger.service'
import { PluginsService } from '../plugins/plugins.service'
import { ServerService } from '../server/server.service'

export enum HomebridgeStatus {
  OK = 'ok',
  UP = 'up',
  DOWN = 'down',
}

export interface HomebridgeStatusUpdate {
  status: HomebridgeStatus
  paired?: null | boolean
  setupUri?: null | string
  name?: string
  username?: string
  pin?: string
}

interface DockerRelease {
  tag_name: string
  published_at: string
  prerelease: boolean
  body: string
}

interface DockerReleaseInfo {
  version: string
  publishedAt: string
  isPrerelease: boolean
  isTest: boolean
  testTag: 'beta' | 'test' | null
  isLatestStable: boolean
}

const execAsync = promisify(exec)

@Injectable()
export class StatusService {
  private statusCache = new NodeCache({ stdTTL: 3600 })
  private dashboardLayout: any
  private homebridgeStatus: HomebridgeStatus = HomebridgeStatus.DOWN
  private homebridgeStatusChange = new Subject<HomebridgeStatus>()

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
    private httpService: HttpService,
    private logger: Logger,
    private configService: ConfigService,
    private pluginsService: PluginsService,
    private serverService: ServerService,
    private homebridgeIpcService: HomebridgeIpcService,
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
      this.logger.warn('Server metrics monitoring disabled.')
    }

    this.homebridgeIpcService.on('serverStatusUpdate', (data: HomebridgeStatusUpdate) => {
      this.homebridgeStatus = data.status === HomebridgeStatus.OK ? HomebridgeStatus.UP : data.status

      if (data?.setupUri) {
        this.serverService.setupCode = data.setupUri
        this.serverService.paired = data.paired
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
    const cpuTempData = await cpuTemperature()

    if (cpuTempData.main === -1 && this.configService.ui.temp) {
      return this.getCpuTempLegacy()
    }

    return cpuTempData
  }

  /**
   * The old way of getting the cpu temp
   */
  private async getCpuTempLegacy() {
    try {
      const tempData = await readFile(this.configService.ui.temp, 'utf-8')
      const cpuTemp = Number.parseInt(tempData, 10) / 1000
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
    if (!this.memoryUsageHistory.length) {
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
    }
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
    }
  }

  /**
   * Socket Handler - Per Client
   * Start emitting server stats to client
   * @param client
   */
  public async watchStats(client: any) {
    let homebridgeStatusInterval: NodeJS.Timeout

    client.emit('homebridge-status', await this.getHomebridgeStats())

    const homebridgeStatusChangeSub: Subscription = this.homebridgeStatusChange.subscribe(async () => {
      client.emit('homebridge-status', await this.getHomebridgeStats())
    })

    // Cleanup on disconnect
    const onEnd = () => {
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
  private async getHomebridgeStats() {
    return {
      consolePort: this.configService.ui.port,
      port: this.configService.homebridgeConfig.bridge.port,
      pin: this.configService.homebridgeConfig.bridge.pin,
      setupUri: await this.serverService.getSetupCode(),
      paired: this.serverService.paired,
      packageVersion: this.configService.package.version,
      status: await this.checkHomebridgeStatus(),
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
      glibcVersion: this.getGlibcVersion(),
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
   * Checks the current version of Node.js and compares to the latest LTS
   */
  public async getNodeJsVersionInfo() {
    const cachedResult = this.statusCache.get('nodeJsVersion')

    if (cachedResult) {
      return cachedResult
    }

    try {
      const versionList = (await firstValueFrom(this.httpService.get('https://nodejs.org/dist/index.json'))).data

      // Get the newest v18 and v20 in the list
      const latest18 = versionList.filter((x: { version: string }) => x.version.startsWith('v18'))[0]
      const latest22 = versionList.filter((x: { version: string }) => x.version.startsWith('v22'))[0]
      const latest24 = versionList.filter((x: { version: string }) => x.version.startsWith('v24'))[0]

      let updateAvailable = false
      let latestVersion = process.version
      let showNodeUnsupportedWarning = false
      let showGlibcUnsupportedWarning = false

      /**
       * NodeJS Version - Minimum GLIBC Version
       *
       *      18            2.28
       *      20            2.31
       *      22            2.31 (assumption - the code below assumes this)
       *      24            ????
       */

      // Behaviour depends on the installed version of node
      switch (process.version.split('.')[0]) {
        case 'v18': {
          // Currently using v18, but v22 is available
          // If the user is running linux, then check their glibc version
          //   If they are running glibc 2.31 or higher, then show the option to update to v22
          //   Otherwise we would still want to see if there is a minor/patch update available for v18
          // Otherwise, already show the option for updating to node 22
          if (platform() === 'linux') {
            const glibcVersion = this.getGlibcVersion()
            if (glibcVersion) {
              if (Number.parseFloat(glibcVersion) >= 2.31) {
                // Glibc version is high enough to support v22
                updateAvailable = true
                latestVersion = latest22.version
              } else {
                // Glibc version is too low to support v22
                // Check if there is a new minor/patch version available
                if (gt(latest18.version, process.version)) {
                  updateAvailable = true
                  latestVersion = latest18.version
                }

                // Show the user a warning about the glibc version for upcoming end-of-life Node 18
                if (Number.parseFloat(glibcVersion) < 2.31) {
                  showGlibcUnsupportedWarning = true
                }
              }
            }
          } else {
            // Not running linux, so show the option for updating to node 22
            updateAvailable = true
            latestVersion = latest22.version
          }
          break
        }
        case 'v20': {
          // Currently using v20
          // Show the option for updating to node 22
          updateAvailable = true
          latestVersion = latest22.version
          break
        }
        case 'v22': {
          // Currently using v22
          // Check if there is a new minor/patch version available
          if (gt(latest22.version, process.version)) {
            updateAvailable = true
            latestVersion = latest22.version
          }
          break
        }
        case 'v24': {
          // Currently using v24
          // Check if there is a new minor/patch version available
          if (gt(latest24.version, process.version)) {
            updateAvailable = true
            latestVersion = latest24.version
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

      const versionInformation = {
        currentVersion: process.version,
        latestVersion,
        updateAvailable,
        showNodeUnsupportedWarning,
        showGlibcUnsupportedWarning,
        installPath: dirname(process.execPath),
        npmVersion,
      }
      this.statusCache.set('nodeJsVersion', versionInformation, 86400)
      return versionInformation
    } catch (e) {
      this.logger.log(`Failed to check for Node.js version updates (check your internet connection) as ${e.message}.`)
      const versionInformation = {
        currentVersion: process.version,
        latestVersion: process.version,
        updateAvailable: false,
        showNodeUnsupportedWarning: false,
        showGlibcUnsupportedWarning: false,
      }
      this.statusCache.set('nodeJsVersion', versionInformation, 3600)
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
            .filter(release => release.testTag === 'beta' && /^beta-\d{4}-\d{2}-\d{2}$/i.test(release.version))
            .sort((a, b) => b.version.localeCompare(a.version)) // Sort by date descending
          latestVersion = targetReleases[0]?.version || null
        } else if (lowerCurrentVersion.startsWith('test-')) {
          // Current version is test; select latest test version
          targetReleases = releases
            .filter(release => release.testTag === 'test' && /^test-\d{4}-\d{2}-\d{2}$/i.test(release.version))
            .sort((a, b) => b.version.localeCompare(a.version)) // Sort by date descending
          latestVersion = targetReleases[0]?.version || null
        } else {
          // Current version is stable or invalid; select latest stable version
          const stableRelease = releases.find(release => release.isLatestStable)
          latestVersion = stableRelease?.version || null
        }

        if (currentVersion && latestVersion) {
          // Compare versions as dates if they match the expected format
          const dateRegex = /\d{4}-\d{2}-\d{2}$/
          if (dateRegex.test(currentVersion) && dateRegex.test(latestVersion)) {
            const currentDate = new Date(currentVersion.match(dateRegex)![0])
            const latestDate = new Date(latestVersion.match(dateRegex)![0])
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
        .filter(release => /^\d{4}-\d{2}-\d{2}$/.test(release.tag_name)) // Stable: YYYY-MM-DD
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
