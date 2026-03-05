import { InjectionToken } from '@angular/core'

import { PluginFundingOption } from '@/app/core/plugins'

/**
 * Central file for all modal data injection tokens
 * Provides type-safe dependency injection for modal components
 */

// ===== Confirm Modal =====
export interface ConfirmModalData {
  title: string
  message: string
  message2?: string
  message3?: string
  confirmButtonLabel?: string
  confirmButtonClass?: string
  faIconClass?: string
  ctaButtonLabel?: string
  ctaButtonLink?: string
}

export const CONFIRM_MODAL_DATA = new InjectionToken<ConfirmModalData>('ConfirmModalData')

// ===== Information Modal =====
export interface InformationModalData {
  title: string
  subtitle?: string
  message?: string
  markdownMessage2?: string
  ctaButtonLabel?: string
  ctaButtonLink?: string
  faIconClass?: string
}

export const INFORMATION_MODAL_DATA = new InjectionToken<InformationModalData>('InformationModalData')

// ===== Plugin Management =====
export interface PluginModalData {
  plugin: any // Plugin type
  schema?: any
  pluginConfig?: any[]
}

export const PLUGIN_MODAL_DATA = new InjectionToken<PluginModalData>('PluginModalData')

export interface PluginBridgeModalData {
  plugin: any
  schema: any
  justInstalled?: boolean
}

export const PLUGIN_BRIDGE_MODAL_DATA = new InjectionToken<PluginBridgeModalData>('PluginBridgeModalData')

export interface CustomPluginsModalData {
  plugin: any
  schema: any
  pluginConfig?: any[]
}

export const CUSTOM_PLUGINS_MODAL_DATA = new InjectionToken<CustomPluginsModalData>('CustomPluginsModalData')

export interface PluginLogsModalData {
  plugin: any
  childBridges?: any[]
}

export const PLUGIN_LOGS_MODAL_DATA = new InjectionToken<PluginLogsModalData>('PluginLogsModalData')

export interface UninstallPluginModalData {
  plugin: any
  childBridges?: any[]
  action?: string
  keepOrphans?: boolean
  onRefreshPluginList?: () => void
}

export const UNINSTALL_PLUGIN_MODAL_DATA = new InjectionToken<UninstallPluginModalData>('UninstallPluginModalData')

export interface ResetAccessoriesModalData {
  childBridges?: any[]
}

export const RESET_ACCESSORIES_MODAL_DATA = new InjectionToken<ResetAccessoriesModalData>('ResetAccessoriesModalData')

export interface ManagePluginModalData {
  action: string
  pluginName: string
  pluginDisplayName?: string
  plugin?: any
  targetVersion?: string
  latestVersion?: string
  installedVersion?: string
  isValidNode?: boolean
  isValidHb?: boolean
  isDisabled?: boolean
  isConfigured?: boolean
  justInstalled?: boolean
  schema?: any
  childBridges?: any[]
  isUpdating?: boolean
  onRefreshPluginList?: () => void
  verifiedPlugin?: boolean
  verifiedPlusPlugin?: boolean
  funding?: PluginFundingOption[] | PluginFundingOption
  backToVersionModal?: any
}

export const MANAGE_PLUGIN_MODAL_DATA = new InjectionToken<ManagePluginModalData>('ManagePluginModalData')

export interface DisablePluginModalData {
  pluginName: string
  isConfigured?: boolean
  isConfiguredDynamicPlatform?: boolean
  keepOrphans?: boolean
}

export const DISABLE_PLUGIN_MODAL_DATA = new InjectionToken<DisablePluginModalData>('DisablePluginModalData')

export interface PluginCompatibilityModalData {
  plugin: any
  isValidNode?: boolean
  isValidHb?: boolean
  action?: 'install' | 'update' | 'alternate' | null
}

export const PLUGIN_COMPATIBILITY_MODAL_DATA = new InjectionToken<PluginCompatibilityModalData>('PluginCompatibilityModalData')

export interface ManageVersionModalData {
  plugin: any
  onRefreshPluginList: () => void
  onSettingsChange?: () => void
}

export const MANAGE_VERSION_MODAL_DATA = new InjectionToken<ManageVersionModalData>('ManageVersionModalData')

export interface SwitchToScopedModalData {
  plugin: any
}

export const SWITCH_TO_SCOPED_MODAL_DATA = new InjectionToken<SwitchToScopedModalData>('SwitchToScopedModalData')

// ===== User Management =====
export interface UserModalData {
  user: any // User type
  existingUsers?: any[] // For duplicate validation
}

export const USER_MODAL_DATA = new InjectionToken<UserModalData>('UserModalData')

export interface AddUserModalData {
  existingUsers: any[] // List of existing users for duplicate validation
}

export const ADD_USER_MODAL_DATA = new InjectionToken<AddUserModalData>('AddUserModalData')

// ===== Settings =====
export interface NetworkInterfacesModalData {
  adaptersAvailable: any[]
  adaptersSelected: any[]
}

export const NETWORK_INTERFACES_MODAL_DATA = new InjectionToken<NetworkInterfacesModalData>('NetworkInterfacesModalData')

export interface AccessoryControlListsModalData {
  existingBlacklist: string[]
}

export const ACCESSORY_CONTROL_LISTS_MODAL_DATA = new InjectionToken<AccessoryControlListsModalData>('AccessoryControlListsModalData')

export interface RestoreModalData {
  setupWizardRestore?: boolean
  selectedBackup?: any
}

export const RESTORE_MODAL_DATA = new InjectionToken<RestoreModalData>('RestoreModalData')

// ===== Remove Individual Accessories =====
export interface RemoveIndividualAccessoriesModalData {
  selectedBridge: string
}

export const REMOVE_INDIVIDUAL_ACCESSORIES_MODAL_DATA = new InjectionToken<RemoveIndividualAccessoriesModalData>('RemoveIndividualAccessoriesModalData')

// ===== Accessory Info =====
export interface AccessoryInfoModalData {
  service: any
  accessoryCache: any[]
  pairingCache: any[]
}

export const ACCESSORY_INFO_MODAL_DATA = new InjectionToken<AccessoryInfoModalData>('AccessoryInfoModalData')

// ===== Config Editor =====
export interface ConfigRestoreModalData {
  currentConfig: string
  fromSettings?: boolean
}

export const CONFIG_RESTORE_MODAL_DATA = new InjectionToken<ConfigRestoreModalData>('ConfigRestoreModalData')

// ===== Widget Control =====
export interface WidgetControlModalData {
  widget: any
}

export const WIDGET_CONTROL_MODAL_DATA = new InjectionToken<WidgetControlModalData>('WidgetControlModalData')

// ===== Widget Visibility =====
export interface WidgetVisibilityModalData {
  dashboard: any
  resetLayout: () => void
  lockLayout: () => void
  unlockLayout: () => void
}

export const WIDGET_VISIBILITY_MODAL_DATA = new InjectionToken<WidgetVisibilityModalData>('WidgetVisibilityModalData')

// ===== Child Bridges =====
export interface RestartChildBridgesModalData {
  bridges: any[]
}

export const RESTART_CHILD_BRIDGES_MODAL_DATA = new InjectionToken<RestartChildBridgesModalData>('RestartChildBridgesModalData')

// ===== Node Version Modal =====
export interface NodeVersionModalData {
  nodeVersion: string
  latestVersion: string
  showNodeUnsupportedWarning: boolean
  homebridgeRunningInSynologyPackage: boolean
  homebridgeRunningInDocker: boolean
  homebridgePkg: any
  architecture: string
  supportsNodeJs24: boolean
  onUpdate?: () => Promise<void>
  statusIo?: any
}

export const NODE_VERSION_MODAL_DATA = new InjectionToken<NodeVersionModalData>('NodeVersionModalData')

// ===== Homebridge V2 Modal =====
export interface HbV2ModalData {
  isUpdating: boolean
  skipIfCompatible: boolean
}

export const HB_V2_MODAL_DATA = new InjectionToken<HbV2ModalData>('HbV2ModalData')
