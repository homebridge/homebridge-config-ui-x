export interface NetworkAdapterAvailable {
  // What bridge.bind holds for this adapter when it is selected: its name, or one of its IP addresses
  bindBy?: string
  carrierChanges?: number
  default?: boolean
  dhcp?: boolean
  dnsSuffix?: string
  duplex?: string
  ieee8021xAuth?: string
  ieee8021xState?: string
  iface: string
  ifaceName: string
  internal: boolean
  ip4: string
  ip4subnet: string
  ip6: string
  ip6subnet: string
  mac: string
  mtu: number
  missing?: boolean
  operstate: string
  selected: boolean
  speed: number
  type: string
  virtual?: boolean
}

export interface NetworkAdapterSelected {
  // Whether bridge.bind holds an IP address for this adapter rather than its name
  byAddress: boolean
  // The bridge.bind entry as written in config.json: an adapter name or an IP address
  entry: string
  // The adapter the entry stands for now, or the entry itself when the machine has no such adapter or address
  iface: string
  ip4?: string
  ip6?: string
  missing: boolean
  selected: boolean
}

// One bridge.bind entry with the adapter it stands for, as /server/network-interfaces/bridge/resolved returns it
export interface ResolvedBindEntry {
  entry: string
  iface: string | null
  isAddress: boolean
}

export interface CachedAccessory {
  displayName: string
  $cacheFile?: string
  $protocol?: 'hap' | 'matter'
  $deviceId?: string
  uuid?: string
  UUID?: string
  [key: string]: unknown
}

export interface Pairing {
  _id: string
  _username: string
  _main?: boolean
  name: string
  accessories: CachedAccessory[]
}

export interface SslKeyCertResponse {
  keyPath?: string
  certPath?: string
}

export interface SslPfxResponse {
  pfxPath?: string
}
