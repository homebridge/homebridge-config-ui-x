export interface PluginChildBridge {
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
  name?: string
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
  }
  mdns?: {
    interface?: string | string[]
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

export interface ChildBridgeToRestart {
  name: string
  username: string
}

export interface ConfigRestoreBackup {
  id: string
  timestamp: string
  file: string
}
