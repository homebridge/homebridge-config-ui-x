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
  webroot?: string
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
