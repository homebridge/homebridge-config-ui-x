export interface ChildBridge {
  identifier: string
  manuallyStopped: boolean
  name: string
  paired: boolean
  pid: number
  pin: string
  plugin: string
  port?: number
  setupUri: string
  status: string
  username: string
}

export interface DeviceInfo {
  category: number
  configVersion: number
  displayName: string
  lastFirmwareVersion: string
  pincode: string
  setupID: string
  _category: string
  _id: string
  _isPaired: boolean
  _main: boolean
  _setupCode: string
  _username: string
}

export interface PluginConfigBlock {
  config: Record<string, any>
  name: string
  __uuid__: string
}

export interface PluginSchema {
  pluginAlias: string
  pluginType: 'platform' | 'accessory'
  strictValidation?: boolean
  singular?: boolean
  headerDisplay?: string
  footerDisplay?: string
  schema: any
  form?: any
  display?: any
}

export interface VersionData {
  version: string
  engines?: {
    homebridge: string
    node: string
  }
}
