export interface FeatureFlags {
  [key: string]: boolean
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
  }
  accessoryControl?: {
    debug?: boolean
    instanceBlacklist?: string[]
  }
  plugins?: {
    hideUpdatesFor?: string[]
    alwaysShowBetas?: boolean
  }
  linux?: {
    shutdown?: string
    restart?: string
  }
  enableMdnsAdvertise?: boolean
  terminal?: {
    persistence?: boolean
    hideWarning?: boolean
    bufferSize?: number
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
