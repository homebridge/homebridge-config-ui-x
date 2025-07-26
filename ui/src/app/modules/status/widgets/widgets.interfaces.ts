export interface PluginNodeCheck {
  displayName: string
  name: string
  isSupported: string
  isSupportedStr: string
}

export interface NodeJsInfo {
  currentVersion: string
  installPath: string
  latestVersion: string
  npmVersion: string
  showNodeUnsupportedWarning: boolean
  updateAvailable: boolean
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

export interface Widget {
  $configureEvent: any
  $resizeEvent: any
  $saveWidgetsEvent: any
  cols: number
  component: string
  draggable: boolean
  hideOnMobile: boolean
  mobileOrder: number
  rows: number
  x: number
  y: number
  accessoryOrder?: string[] // accessory widget
  fontSize?: number // homebridge logs widget, terminal widget
  fontWeight?: string // homebridge logs widget, terminal widget
  theme?: 'light' | 'dark' // homebridge logs widget, terminal widget
  timeFormat?: string // clock widget
  dateFormat?: string // clock widget
  refreshInterval?: number // cpu widget, memory widget, disk widget, network widget
  historyItems?: number // cpu widget, memory widget, disk widget, network widget
  networkInterface?: string // network widget
  location?: {
    id: string // weather widget
  }
}
