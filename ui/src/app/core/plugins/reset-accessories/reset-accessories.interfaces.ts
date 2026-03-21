export interface ResetAccessoriesPairing {
  _id: string
  _username: string
  _category: string
  _main: boolean
  _matter?: boolean
  _matterOnly?: boolean
  _plugin?: string
  _protocol: 'hap' | 'matter'
  _displayName: string
  name: string
}

export interface ResetAccessoriesDeleteItem {
  id: string
  protocol: 'hap' | 'matter'
}
