export interface PluginBridgeMatterBridge {
  username: string
  identifier: string
  name: string
}

export interface PluginBridgeDeleteBridge {
  id: string
  bridgeName: string
  paired: boolean
}

export interface PluginBridgeAccessoryLink {
  index: string
  usesIndex: string
  name: string
  username: string
  port: number
}
