export interface InstalledPlugin {
  name: string
  hb2Ready: 'hide' | 'supported' | 'unknown'
  engines?: {
    homebridge?: string
  }
  [key: string]: unknown
}
