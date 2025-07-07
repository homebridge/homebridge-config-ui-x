export interface EnvInterface {
  platform: 'darwin' | 'win32' | 'linux' | 'freebsd'
  enableAccessories: boolean
  enableTerminalAccess: boolean
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
  serviceMode: boolean
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
  }
  linux?: {
    shutdown?: string
    restart?: string
  }
  host?: string
  proxyHost?: string
  homebridgePackagePath?: string
  disableServerMetricsMonitoring?: boolean
}

export interface AppSettingsInterface {
  env: EnvInterface
  formAuth: boolean
  sessionTimeout: number
  theme: string
  lightingMode: 'auto' | 'light' | 'dark'
  menuMode: 'default' | 'freeze'
  wallpaper: string
  serverTimestamp: string
}
