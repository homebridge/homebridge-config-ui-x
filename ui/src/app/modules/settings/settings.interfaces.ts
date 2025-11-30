export interface NetworkAdapterAvailable {
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
  iface: string
  ip4?: string
  ip6?: string
  missing: boolean
  selected: boolean
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
