/**
 * Matter-related interfaces for the accessories service
 */

/**
 * Represents a Matter event from the IPC service
 */
export interface MatterEvent {
  type: 'accessoriesData' | 'accessoryUpdate' | 'accessoryAdded' | 'accessoryRemoved' | 'accessoryControlResponse'
  data?: MatterAccessoriesResponse | MatterAccessoryInfo | MatterStateUpdate | MatterControlResponse
}

/**
 * Response from getMatterAccessories IPC call
 */
export interface MatterAccessoriesResponse {
  accessories: MatterAccessory[]
  error?: string
}

/**
 * Raw Matter accessory data from IPC
 */
export interface MatterAccessory {
  uuid: string
  displayName: string
  deviceType: string
  clusters: Record<string, Record<string, unknown>>
  manufacturer?: string
  model?: string
  serialNumber?: string
  firmwareRevision?: string
  bridge?: {
    name?: string
    username?: string
  }
  plugin?: string
  platform?: string
  commissioned?: boolean
  fabricCount?: number
  fabrics?: unknown[]
  parts?: MatterAccessoryPart[]
}

/**
 * Part of a composed Matter accessory
 */
export interface MatterAccessoryPart {
  id: string
  displayName: string
  deviceType: string
  clusters: Record<string, Record<string, unknown>>
}

/**
 * Matter accessory info response
 */
export interface MatterAccessoryInfo extends MatterAccessory {
  error?: string
}

/**
 * Transformed Matter service for the UI
 */
export interface MatterService {
  uniqueId: string
  uuid: string
  serviceName: string
  displayName: string
  deviceType: string
  clusters: Record<string, Record<string, unknown>>
  partId?: string
  protocol: 'matter'
  instance: {
    name: string
    username: string
  }
  accessoryInformation: {
    'Name': string
    'Manufacturer': string
    'Model': string
    'Serial Number': string
    'Firmware Revision': string
  }
  bridge?: {
    name?: string
    username?: string
  }
  plugin?: string
  platform?: string
  commissioned?: boolean
  fabricCount?: number
  fabrics?: unknown[]
  aid: 0
  iid: 0
}

/**
 * Matter state update event
 */
export interface MatterStateUpdate {
  uuid: string
  cluster: string
  state: Record<string, unknown>
  partId?: string
}

/**
 * Matter control response
 */
export interface MatterControlResponse {
  success: boolean
  error?: string
}

/**
 * Matter control request
 */
export interface MatterControlRequest {
  uniqueId: string
  cluster: string
  attributes: Record<string, unknown>
}

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
  refresh?: boolean
}
