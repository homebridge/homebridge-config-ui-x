import type { MatterFabricInfo } from '../server.interfaces'

export interface PluginFundingOption {
  type: string
  url: string
}

export interface Plugin {
  author: string
  description: string
  disabled: boolean
  displayName: string
  engines?: {
    node?: string
    homebridge?: string
  }
  funding?: PluginFundingOption[] | PluginFundingOption
  globalInstall: boolean
  hasChildBridges: boolean
  hasChildBridgesUnpaired: boolean
  hasExternalAccessories: boolean
  icon?: string
  installPath: string
  installedVersion: string
  isConfigured: boolean
  isConfiguredDynamicPlatform: boolean
  isUnmaintained: boolean
  isHbScoped: boolean
  lastUpdated?: string
  latestVersion: string
  links: {
    npm?: string
    homepage?: string
    bugs?: string
  }
  multipleInstances?: boolean
  name: string
  newHbScope?: {
    from: string
    switch: string
    to: string
  }
  private: boolean
  publicPackage: boolean
  recommendChildBridge: boolean
  settingsSchema: boolean
  updateAvailable: boolean
  updateEngines?: null | {
    homebridge?: string
    node?: string
  }
  updateTag: null | string
  verifiedPlugin: boolean
  verifiedPlusPlugin: boolean
  supportsMatter?: boolean
  // Present when the plugin came from GET /plugins?include=config (admin
  // only). Holds the plugin's saved config.json blocks; the plugins page
  // reads it instead of fetching per-plugin via /config-editor/plugin/:name.
  config?: any[]
}

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
  /**
   * HAP config. Older Homebridge sends a boolean; >= 2.0.3-beta.26 sends the
   * nested object form. Both shapes are typed so the UI can read either;
   * feature flags determine which nested properties are available.
   */
  hap?: boolean | { enabled?: boolean, externalsOnly?: boolean, disableIdentifyingMaterial?: boolean }
  matterConfig?: {
    port?: number
    enabled?: boolean
    /** When true, Matter bridge node is suppressed but external Matter accessories may still publish. */
    externalsOnly?: boolean
  }
  matterIdentifier?: string
  matterSerialNumber?: string
  matterDeviceCount?: number
  matterCommissioned?: boolean
  matterSetupUri?: string
  matterPin?: string
  matterFabricCount?: number
  matterFabrics?: MatterFabricInfo[]
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

export interface PluginEditorContext {
  pluginName: string
  alias: {
    pluginAlias: string | null
    pluginType: 'platform' | 'accessory' | null
  }
  configSchema: any | null
  config: any[]
  childBridges: ChildBridge[]
}

export interface VersionData {
  version: string
  engines?: {
    homebridge?: string
    node?: string
  } | null
}
