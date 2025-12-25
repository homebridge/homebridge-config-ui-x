import type { Buffer } from 'node:buffer'

export interface StartupConfig {
  host?: '::' | '0.0.0.0' | string
  httpsOptions?: {
    key?: Buffer
    cert?: Buffer
    pfx?: Buffer
    passphrase?: string
  }
  cspWsOverride?: string
  debug?: boolean
}

interface PluginChildBridge {
  username: string
  port?: number
  pin?: string
  name?: string
  manufacturer?: string
  model?: string
  firmwareRevision?: string
  env?: {
    DEBUG?: string
    NODE_OPTIONS?: string
  }
}

export interface PlatformConfig {
  platform: string
  name?: string
  _bridge?: PluginChildBridge
  [key: string]: any
}

export interface AccessoryConfig {
  accessory: string
  name: string
  _bridge?: PluginChildBridge
  [key: string]: any
}

export interface HomebridgeConfig {
  bridge: {
    username: string
    pin: string
    name: string
    port: number
    advertiser?: 'avahi' | 'resolved' | 'ciao' | 'bonjour-hap'
    bind?: string | string[]
    manufacturer?: string
    model?: string
    firmwareRevision?: string
  }
  mdns?: {
    interface?: string | string[]
    legacyAdvertiser?: boolean
  }
  ports?: {
    start?: number
    end?: number
  }
  platforms?: PlatformConfig[]
  accessories?: AccessoryConfig[]
  plugins?: string[]
  disabledPlugins?: string[]
}

/**
 * Homebridge UI bridge config interface
 */
export interface HomebridgeUiBridgeConfig {
  username: string
  hideHapAlert?: boolean
  scheduledRestartCron?: string
}

/**
 * Homebridge UI config interface
 */
export interface HomebridgeUiConfig {
  name: string
  port: number
  host?: '::' | '0.0.0.0' | string
  proxyHost?: string
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
    alwaysShowBetas?: boolean
  }
  scheduledRestartCron?: string
  bridges?: HomebridgeUiBridgeConfig[]
  temp?: string
  tempUnits?: string
  wallpaper?: string
  linux?: {
    shutdown?: string
    restart?: string
  }
  debug?: boolean
  sessionTimeout?: number
  sessionTimeoutInactivityBased?: boolean
  homebridgePackagePath?: string
  scheduledBackupPath?: string
  scheduledBackupDisable?: boolean
  disableServerMetricsMonitoring?: boolean
  enableMdnsAdvertise?: boolean
  terminal?: {
    persistence?: boolean
    hideWarning?: boolean
    bufferSize?: number
  }
}
