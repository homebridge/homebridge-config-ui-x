export interface FeatureFlags {
  [key: string]: boolean
}

export type NodeUpdatePolicy = 'all' | 'major' | 'none'
export type HomebridgeUpdatePolicy = 'all' | 'beta' | 'major' | 'none'
export type HomebridgeUiUpdatePolicy = 'all' | 'beta' | 'major' | 'none'

export interface BridgeConfig {
  username: string
  hideHapAlert?: boolean
  hideMatterAlert?: boolean
  scheduledRestartCron?: string
}

export interface EnvInterface {
  platform: 'darwin' | 'win32' | 'linux' | 'freebsd'
  enableAccessories: boolean
  enableTerminalAccess: boolean
  featureFlags?: FeatureFlags
  homebridgeInstanceName: string
  homebridgeVersion?: string
  homebridgeUiVersion?: string
  nodeVersion: string
  packageName: string
  packageVersion: string
  runningInDocker: boolean
  runningInLinux: boolean
  runningInFreeBSD: boolean
  runningInSynologyPackage: boolean
  runningInPackageMode: boolean
  runningOnRaspberryPi: boolean
  runningOnRaspbianImage: boolean
  canShutdownRestartHost: boolean
  dockerOfflineUpdate: boolean
  lang: string | null
  temperatureUnits: 'c' | 'f'
  temp?: string
  port: number
  instanceId: string
  customWallpaperHash: string
  setupWizardComplete: boolean
  recommendChildBridges: boolean
  scheduledBackupDisable: boolean
  scheduledBackupPath: string
  log?: {
    maxSize?: number
    truncateSize?: number
  }
  ssl?: {
    key?: string
    cert?: string
    pfx?: string
    passphrase?: string
    selfSigned?: boolean
    selfSignedHostnames?: string[]
  }
  accessoryControl?: {
    debug?: boolean
    instanceBlacklist?: string[]
  }
  plugins?: {
    hideUpdatesFor?: string[]
    showBetasFor?: string[]
  }
  nodeUpdatePolicy?: NodeUpdatePolicy
  homebridgeUpdatePolicy?: HomebridgeUpdatePolicy
  homebridgeUiUpdatePolicy?: HomebridgeUiUpdatePolicy
  scheduledRestartCron?: string | null
  bridges?: BridgeConfig[]
  linux?: {
    shutdown?: string
    restart?: string
  }
  enableMdnsAdvertise?: boolean
  terminal?: {
    persistence?: boolean
    hideWarning?: boolean
    bufferSize?: number
    fontSize?: number
    fontWeight?: string
    lightingMode?: 'light' | 'dark'
  }
  homebridgePackagePath?: string
  disableServerMetricsMonitoring?: boolean
}

export interface AppSettingsInterface {
  env: EnvInterface
  formAuth: boolean
  host?: string
  proxyHost?: string
  sessionTimeout: number
  sessionTimeoutInactivityBased: boolean
  theme: string
  lightingMode: 'auto' | 'light' | 'dark'
  menuMode: 'default' | 'freeze'
  wallpaper: string
  serverTimestamp: string
  keepOrphans: boolean
}
