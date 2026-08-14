import type { Buffer } from 'node:buffer'

import { BridgeHapConfig, MatterConfig } from '../matter/matter.interfaces.js'

export interface StartupConfig {
  host?: '::' | '0.0.0.0' | string
  httpsOptions?: {
    key?: Buffer
    cert?: Buffer
    pfx?: Buffer
    passphrase?: string
  }
  cspWsOverride?: string
  // Extra origins permitted to frame the UI, from `ui.allowFrameAncestors`.
  // Empty by default, so the CSP is `frame-ancestors 'self'` — same-origin only.
  allowedFrameAncestors?: string[]
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
  /**
   * HAP toggle. Older Homebridge versions used a boolean (`hap: false` to
   * disable). Homebridge >= 2.0.3-beta.26 expects the nested object form
   * (`{ enabled?, externalsOnly? }`). Both shapes are typed here so config-ui-x
   * can read/write either; the `protocolExternalsOnly` feature flag determines
   * which shape is produced when the user toggles via the UI.
   */
  hap?: boolean | BridgeHapConfig
  env?: {
    DEBUG?: string
    NODE_OPTIONS?: string
  }
  matter?: MatterConfig
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
    /** Boolean form is supported for older homebridge runtimes; >= 2.0.3-beta.26 expects the nested object form. */
    hap?: boolean | BridgeHapConfig
    matter?: MatterConfig
  }
  mdns?: {
    interface?: string | string[]
    legacyAdvertiser?: boolean
  }
  ports?: {
    start?: number
    end?: number
  }
  matterPorts?: {
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
  hideMatterAlert?: boolean
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
    hideChildBridgeSetupFor?: string[]
  }
  nodeUpdatePolicy?: 'all' | 'none' | 'major'
  homebridgeUpdatePolicy?: 'all' | 'beta' | 'major' | 'none'
  homebridgeUiUpdatePolicy?: 'all' | 'beta' | 'major' | 'none'
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
  // Restrict the log viewer / log stream to administrators. Off by default:
  // any signed-in user has always been able to read the Homebridge log.
  restrictLogsToAdmins?: boolean
  // Extra origins permitted to frame the UI (CSP frame-ancestors).
  allowFrameAncestors?: string | string[]
  homebridgePackagePath?: string
  scheduledBackupPath?: string
  scheduledBackupDisable?: boolean
  disableServerMetricsMonitoring?: boolean
  enableMdnsAdvertise?: boolean
  terminal?: {
    persistence?: boolean
    hideWarning?: boolean
    bufferSize?: number
    fontSize?: string | number
    fontWeight?: string | number
    lightingMode?: 'light' | 'dark'
  }
}
