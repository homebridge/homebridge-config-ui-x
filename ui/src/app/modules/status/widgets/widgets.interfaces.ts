import { Plugin } from '@/app/core/plugins/manage-plugins.interfaces'
import { ChildBridgeStatusResponse } from '@/app/core/server.interfaces'

export interface PluginNodeCheck {
  displayName: string
  name: string
  isSupported: string
  isSupportedStr: string
  icon: string
}

export interface NodeJsInfo {
  currentVersion: string
  installPath: string
  latestVersion: string
  npmVersion: string
  showNodeUnsupportedWarning: boolean
  updateAvailable: boolean
  architecture: string
  supportsNodeJs24: boolean
}

export interface ServerInfo {
  homebridgeCustomPluginPath?: string
  homebridgeConfigJsonPath: string
  homebridgeInsecureMode: boolean
  homebridgePluginPath: string
  homebridgeRunningInDocker: boolean
  homebridgeRunningInPackageMode: boolean
  homebridgeRunningInSynologyPackage: boolean
  homebridgeStoragePath: string
  network: {
    iface: string
    ifaceName: string
    default: boolean
    ip4: string
    ip4subnet: string
    ip6?: string
    ip6subnet?: string
  }
  nodeVersion: string
  os: {
    hostname: string
    arch: string
    platform: string
    distro: string
    release: string
    codename: string
    kernel: string
  }
  serviceUser: string
  time: {
    current: number
    uptime: number
    timezone: string
    timezoneName: string
  }
}

export interface DockerDetails {
  currentVersion?: string
  latestVersion: string | null
  latestReleaseBody: string
  updateAvailable: boolean
}

/**
 * Aggregated response for the dashboard "Update Info" widget.
 * Returned by the `get-version-overview` WS event. Per-field null when
 * the corresponding upstream call failed server-side.
 */
export interface VersionOverview {
  serverInfo: ServerInfo | null
  node: NodeJsInfo | null
  homebridge: Plugin | null
  homebridgeUi: Plugin | null
  outOfDatePlugins: Plugin[]
  docker: DockerDetails | null
  hbV2Ready: boolean
}

/**
 * CPU widget data from server
 */
export interface CpuWidgetData {
  cpuTemperature: {
    main?: number
    cores?: number[]
    max?: number
  }
  currentLoad: number
  cpuLoadHistory: number[]
}

/**
 * Memory widget data from server
 */
export interface MemoryWidgetData {
  mem: {
    total: number
    available: number
  }
  memoryUsageHistory: number[]
}

/**
 * Network widget data from server
 */
export interface NetworkWidgetData {
  net: {
    iface: string
    rx_sec: number
    tx_sec: number
  }
  point: number
}

/**
 * Weather widget data from OpenWeatherMap API
 */
export interface OpenWeatherMapResponse {
  name: string
  weather: Array<{
    description: string
    icon: string
  }>
  main: {
    temp: number
  }
  timestamp?: string
}

export interface Widget {
  $configureEvent: any
  $resizeEvent: any
  $saveWidgetsEvent: any
  cols: number
  component: string
  draggable: boolean
  hideOnDesktop: boolean
  hideOnMobile: boolean
  mobileOrder: number
  rows: number
  x: number
  y: number
  accessoryOrder?: string[] // accessory widget
  timeFormat?: string // clock widget
  dateFormat?: string // clock widget
  refreshInterval?: number // cpu widget, memory widget, disk widget, network widget
  historyItems?: number // cpu widget, memory widget, disk widget, network widget
  networkInterface?: string // network widget
  location?: {
    id: string // weather widget
  }
  showNpmVersion?: boolean // update info widget
  dockerExpanded?: boolean // update info widget
  showToolbar?: boolean // homebridge logs widget
}

/**
 * Extends ChildBridgeStatusResponse with UI-only state
 */
export interface ChildBridgeWithUIState extends ChildBridgeStatusResponse {
  restarting?: boolean
}
