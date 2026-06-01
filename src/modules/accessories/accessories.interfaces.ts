/**
 * WebSocket accessory control message
 */
export interface AccessoryControlMessage {
  set?: {
    uniqueId: string
    iid?: number
    value?: string | number | boolean
    cluster?: string
    attributes?: Record<string, unknown>
  }
  smartLightGroup?: {
    uniqueIds: string[]
    restoreAfterMs?: number
  }
  refresh?: boolean
}
