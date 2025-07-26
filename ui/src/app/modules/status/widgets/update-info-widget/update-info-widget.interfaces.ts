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
  glibcVersion?: string
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
