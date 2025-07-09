import type { ReadStream } from 'fs-extra'

import { createHash, randomBytes } from 'node:crypto'
import { homedir, platform, totalmem } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'

import { Injectable } from '@nestjs/common'
import {
  createReadStream,
  pathExists,
  pathExistsSync,
  readJson,
  readJSONSync,
  readJsonSync,
  stat,
  writeJsonSync,
} from 'fs-extra'
import { isEqual } from 'lodash'
import { satisfies } from 'semver'

@Injectable()
export class ConfigService {
  public name = 'homebridge-config-ui-x'

  // Homebridge env
  public configPath = process.env.UIX_CONFIG_PATH || resolve(homedir(), '.homebridge/config.json')
  public storagePath = process.env.UIX_STORAGE_PATH || resolve(homedir(), '.homebridge')
  public customPluginPath = process.env.UIX_CUSTOM_PLUGIN_PATH
  public strictPluginResolution = (process.env.UIX_STRICT_PLUGIN_RESOLUTION === '1')
  public secretPath = resolve(this.storagePath, '.uix-secrets')
  public authPath = resolve(this.storagePath, 'auth.json')
  public accessoryLayoutPath = resolve(this.storagePath, 'accessories', 'uiAccessoriesLayout.json')
  public configBackupPath = resolve(this.storagePath, 'backups/config-backups')
  public instanceBackupPath = resolve(this.storagePath, 'backups/instance-backups')
  public homebridgeInsecureMode = Boolean(process.env.UIX_INSECURE_MODE === '1')
  public homebridgeVersion: string

  // Server env
  public minimumNodeVersion = '20.18.0'
  public runningInDocker = Boolean(process.env.HOMEBRIDGE_CONFIG_UI === '1')
  public runningInSynologyPackage = Boolean(process.env.HOMEBRIDGE_SYNOLOGY_PACKAGE === '1')
  public runningInPackageMode = Boolean(process.env.HOMEBRIDGE_APT_PACKAGE === '1')
  public runningInLinux = (!this.runningInDocker && !this.runningInSynologyPackage && !this.runningInPackageMode && platform() === 'linux')
  public runningInFreeBSD = (platform() === 'freebsd')
  public canShutdownRestartHost = (this.runningInLinux || process.env.UIX_CAN_SHUTDOWN_RESTART_HOST === '1')
  public enableTerminalAccess = (this.runningInDocker && process.env.HOMEBRIDGE_CONFIG_UI_TERMINAL !== '0')
    || (this.runningInPackageMode && process.env.HOMEBRIDGE_CONFIG_UI_TERMINAL !== '0')
    || this.runningInSynologyPackage
    || Boolean(process.env.HOMEBRIDGE_CONFIG_UI_TERMINAL === '1')

  // Plugin management
  public usePluginBundles = (process.env.UIX_USE_PLUGIN_BUNDLES === '1')

  // Recommend child bridges on platforms with > 2GB ram
  public recommendChildBridges = (totalmem() > 2e+9)

  // Check this async
  public runningOnRaspberryPi = false

  // Docker settings
  public startupScript = resolve(this.storagePath, 'startup.sh')
  public dockerOfflineUpdate = this.runningInDocker && satisfies(process.env.CONFIG_UI_VERSION, '>=4.6.2 <=4.44.1', { includePrerelease: true })

  // package.json
  public package = readJsonSync(resolve(process.env.UIX_BASE_PATH, 'package.json'))

  // First user setup wizard
  public setupWizardComplete = true

  // Custom wallpaper
  public customWallpaperHash: string

  // Set true to force the ui to restart on next restart request
  public hbServiceUiRestartRequired = false

  public homebridgeConfig: HomebridgeConfig

  public ui: {
    name: string
    port: number
    host?: '::' | '0.0.0.0' | string
    auth: 'form' | 'none'
    theme: string
    lightingMode: 'auto' | 'light' | 'dark'
    menuMode?: 'default' | 'freeze'
    sudo?: boolean
    restart?: string
    lang?: string
    log?: {
      method?: 'file' | 'custom' | 'systemd' | 'native'
      command?: string
      path?: string
      service?: string
      maxSize?: number
      truncateSize?: number
    }
    ssl?: {
      key?: string
      cert?: string
      pfx?: string
      passphrase?: string
    }
    accessoryControl?: {
      debug?: boolean
      instanceBlacklist?: string[]
    }
    plugins?: {
      hideUpdatesFor?: string[]
    }
    temp?: string
    tempUnits?: string
    wallpaper?: string
    linux?: {
      shutdown?: string
      restart?: string
    }
    debug?: boolean
    proxyHost?: string
    sessionTimeout?: number
    homebridgePackagePath?: string
    scheduledBackupPath?: string
    scheduledBackupDisable?: boolean
    disableServerMetricsMonitoring?: boolean
  }

  private bridgeFreeze: this['homebridgeConfig']['bridge']
  private uiFreeze: this['ui']

  public secrets: {
    secretKey: string
  }

  public instanceId: string

  constructor() {
    const homebridgeConfig = readJSONSync(this.configPath)
    this.parseConfig(homebridgeConfig)
    this.checkIfRunningOnRaspberryPi()
  }

  /**
   * Loads the config from the config.json
   */
  public parseConfig(homebridgeConfig: HomebridgeConfig) {
    this.homebridgeConfig = homebridgeConfig

    if (!this.homebridgeConfig.bridge) {
      this.homebridgeConfig.bridge = {} as this['homebridgeConfig']['bridge']
    }

    this.ui = Array.isArray(this.homebridgeConfig.platforms) ? this.homebridgeConfig.platforms.find(x => x.platform === 'config') : undefined as any

    if (!this.ui) {
      this.ui = {
        name: 'Config',
      } as any
    }

    process.env.UIX_PLUGIN_NAME = this.ui.name || 'homebridge-config-ui-x'

    if (this.runningInDocker) {
      this.setConfigForDocker()
    }

    this.setConfig()

    if (!this.ui.port) {
      this.ui.port = 8080
    }

    if (!this.ui.sessionTimeout) {
      this.ui.sessionTimeout = this.ui.auth === 'none' ? 1296000 : 28800
    }

    if (this.ui.scheduledBackupPath) {
      this.instanceBackupPath = this.ui.scheduledBackupPath
    } else {
      this.instanceBackupPath = resolve(this.storagePath, 'backups/instance-backups')
    }

    this.secrets = this.getSecrets()
    this.instanceId = this.getInstanceId()

    this.freezeUiSettings()
    this.getCustomWallpaperHash()
  }

  /**
   * Settings that are sent to the UI
   * @param {boolean} authorized - return more settings if the user is authorized
   */
  public uiSettings(authorized: boolean = false) {
    const toReturn = {
      env: {
        canShutdownRestartHost: this.canShutdownRestartHost,
        customWallpaperHash: this.customWallpaperHash,
        dockerOfflineUpdate: this.dockerOfflineUpdate,
        homebridgeVersion: this.homebridgeVersion || null,
        homebridgeInstanceName: this.homebridgeConfig.bridge.name,
        instanceId: this.instanceId,
        lang: this.ui.lang === 'auto' ? null : this.ui.lang,
        packageName: this.package.name,
        packageVersion: this.package.version,
        platform: platform(),
        port: this.ui.port,
        setupWizardComplete: this.setupWizardComplete,
        scheduledBackupDisable: Boolean(this.ui.scheduledBackupDisable),
        scheduledBackupPath: this.ui.scheduledBackupPath || this.instanceBackupPath,
      },
      formAuth: Boolean(this.ui.auth !== 'none'),
      sessionTimeout: this.ui.sessionTimeout || 28800,
      lightingMode: this.ui.lightingMode || 'auto',
      serverTimestamp: new Date().toISOString(),
      theme: this.ui.theme || 'deep-purple',
      menuMode: this.ui.menuMode || 'default',
    }

    if (!authorized) {
      return toReturn
    }

    return {
      ...toReturn,
      env: {
        ...toReturn.env,
        enableAccessories: this.homebridgeInsecureMode,
        enableTerminalAccess: this.enableTerminalAccess,
        nodeVersion: process.version,
        recommendChildBridges: this.recommendChildBridges,
        runningInDocker: this.runningInDocker,
        runningInSynologyPackage: this.runningInSynologyPackage,
        runningInPackageMode: this.runningInPackageMode,
        runningInLinux: this.runningInLinux,
        runningInFreeBSD: this.runningInFreeBSD,
        runningOnRaspberryPi: this.runningOnRaspberryPi,
        temperatureUnits: this.ui.tempUnits || 'c',
        temp: this.ui.temp,
        log: {
          maxSize: this.ui.log?.maxSize,
          truncateSize: this.ui.log?.truncateSize,
        },
        ssl: {
          key: this.ui.ssl?.key,
          cert: this.ui.ssl?.cert,
          pfx: this.ui.ssl?.pfx,
          passphrase: this.ui.ssl?.passphrase,
        },
        accessoryControl: {
          debug: this.ui.accessoryControl?.debug,
          instanceBlacklist: this.ui.accessoryControl?.instanceBlacklist || [],
        },
        plugins: {
          hideUpdatesFor: this.ui.plugins?.hideUpdatesFor || [],
        },
        linux: {
          shutdown: this.ui.linux?.shutdown,
          restart: this.ui.linux?.restart,
        },
      },
      menuMode: this.ui.menuMode || 'default',
      wallpaper: this.ui.wallpaper,
      host: this.ui.host,
      proxyHost: this.ui.proxyHost,
      homebridgePackagePath: this.ui.homebridgePackagePath,
      disableServerMetricsMonitoring: this.ui.disableServerMetricsMonitoring,
    }
  }

  /**
   * Checks to see if the UI requires a restart due to changed ui or bridge settings
   */
  public async uiRestartRequired(): Promise<boolean> {
    // If the flag is set, force a restart
    if (this.hbServiceUiRestartRequired) {
      return true
    }

    // If the ui version has changed on disk, a restart is required
    const currentPackage = await readJson(resolve(process.env.UIX_BASE_PATH, 'package.json'))
    if (currentPackage.version !== this.package.version) {
      return true
    }

    // If the ui or bridge config has changed, a restart is required
    return !(isEqual(this.ui, this.uiFreeze) && isEqual(this.homebridgeConfig.bridge, this.bridgeFreeze))
  }

  /**
   * Freeze a copy of the initial ui config and homebridge port
   */
  private freezeUiSettings() {
    if (!this.uiFreeze) {
      // Freeze ui
      this.uiFreeze = {} as this['ui']
      Object.assign(this.uiFreeze, this.ui)
    }

    if (!this.bridgeFreeze) {
      // Freeze bridge port
      this.bridgeFreeze = {} as this['homebridgeConfig']['bridge']
      Object.assign(this.bridgeFreeze, this.homebridgeConfig.bridge)
    }
  }

  /**
   * Populate the required config for homebridge/homebridge docker
   */
  private setConfigForDocker() {
    // Forced config
    this.ui.restart = 'killall -15 homebridge; sleep 5.1; killall -9 homebridge; kill -9 $(pidof homebridge-config-ui-x);'
    this.homebridgeInsecureMode = Boolean(process.env.HOMEBRIDGE_INSECURE === '1')
    this.ui.sudo = false
    this.ui.log = {
      method: 'file',
      path: '/homebridge/logs/homebridge.log',
      maxSize: this.ui.log?.maxSize,
      truncateSize: this.ui.log?.truncateSize,
    }

    // These options can be overridden using the config.json file
    if (!this.ui.port && process.env.HOMEBRIDGE_CONFIG_UI_PORT) {
      this.ui.port = Number.parseInt(process.env.HOMEBRIDGE_CONFIG_UI_PORT, 10)
    }
    this.ui.theme = this.ui.theme || process.env.HOMEBRIDGE_CONFIG_UI_THEME || 'deep-purple'
    this.ui.auth = this.ui.auth || process.env.HOMEBRIDGE_CONFIG_UI_AUTH as 'form' | 'none' || 'form'
    this.ui.wallpaper = this.ui.wallpaper || process.env.HOMEBRIDGE_CONFIG_UI_LOGIN_WALLPAPER || undefined
  }

  /**
   * Populate the required config
   */
  private setConfig() {
    this.homebridgeInsecureMode = Boolean(process.env.UIX_INSECURE_MODE === '1')
    this.ui.restart = undefined
    this.ui.sudo = (platform() === 'linux' && !this.runningInDocker && !this.runningInSynologyPackage && !this.runningInPackageMode) || platform() === 'freebsd'
    this.ui.log = {
      method: 'native',
      path: resolve(this.storagePath, 'homebridge.log'),
      maxSize: this.ui.log?.maxSize,
      truncateSize: this.ui.log?.truncateSize,
    }
  }

  /**
   * Gets the unique secrets for signing JWTs
   */
  private getSecrets() {
    if (pathExistsSync(this.secretPath)) {
      try {
        const secrets = readJsonSync(this.secretPath)
        if (!secrets.secretKey) {
          return this.generateSecretToken()
        } else {
          return secrets
        }
      } catch (e) {
        return this.generateSecretToken()
      }
    } else {
      return this.generateSecretToken()
    }
  }

  /**
   * Generates the secret token for signing JWTs
   */
  private generateSecretToken() {
    const secrets = {
      secretKey: randomBytes(32).toString('hex'),
    }

    writeJsonSync(this.secretPath, secrets)

    return secrets
  }

  /**
   * Generates a public instance id from a sha256 has of the secret key
   */
  private getInstanceId(): string {
    return createHash('sha256').update(this.secrets.secretKey).digest('hex')
  }

  /**
   * Checks to see if custom wallpaper has been set, and generate a sha256 hash to use as the file name
   */
  private async getCustomWallpaperHash(): Promise<void> {
    try {
      if (this.ui.wallpaper) {
        const filePath = resolve(this.storagePath, this.ui.wallpaper)
        const fileStat = await stat(filePath)
        const hash = createHash('sha256')
        hash.update(`${fileStat.birthtime}${fileStat.ctime}${fileStat.size}${fileStat.blocks}`)
        this.customWallpaperHash = `${hash.digest('hex')}.jpg`
      }
    } catch (e) {
      // Do nothing
    }
  }

  public removeWallpaperCache() {
    this.customWallpaperHash = undefined
  }

  /**
   * Stream the custom wallpaper
   */
  public streamCustomWallpaper(): ReadStream {
    return createReadStream(resolve(this.storagePath, this.ui.wallpaper))
  }

  /**
   * Checks to see if we are running on a Raspberry Pi
   */
  private async checkIfRunningOnRaspberryPi() {
    try {
      this.runningOnRaspberryPi = await pathExists('/usr/bin/vcgencmd') && await pathExists('/usr/bin/raspi-config')
    } catch (e) {
      this.runningOnRaspberryPi = false
    }
  }
}

export interface HomebridgeConfig {
  bridge: {
    username: string
    pin: string
    name: string
    port: number
    advertiser?: 'avahi' | 'resolved' | 'ciao' | 'bonjour-hap'
    bind?: string | string[]
  }
  mdns?: {
    interface?: string | string[]
  }
  ports?: {
    start?: number
    end?: number
  }
  platforms: Record<string, any>[]
  accessories: Record<string, any>[]
  plugins?: string[]
  disabledPlugins?: string[]
}
