/**
 * Consolidated Matter type definitions
 */

// --- Config types ---

/**
 * Matter configuration interface
 */
export interface MatterConfig {
  port?: number
  /**
   * When `false`, Matter is configured but not advertised — the config block
   * and on-disk commissioning storage are preserved so it can be re-enabled
   * without re-commissioning. Missing/`true` means enabled. Mirrors how
   * `bridge.hap.enabled: false` disables HAP without losing pairing data.
   * Only honoured by Homebridge >= 2.0.3-beta.22 (see the `matterDisableInPlace`
   * feature flag).
   */
  enabled?: boolean
  /**
   * When `true`, the Matter bridge node itself is NOT advertised, but plugins
   * may still publish external Matter accessories (each gets its own pairing).
   * Requires `enabled: false`. Only honoured by Homebridge >= 2.0.3-beta.26
   * (see the `protocolExternalsOnly` feature flag).
   */
  externalsOnly?: boolean
}

/**
 * HAP-bridge configuration interface — used by Homebridge >= 2.0.3-beta.26.
 * Earlier versions used a boolean `hap` field; the dual shape stays supported
 * here so config-ui-x keeps working against older homebridge runtimes (see
 * the `protocolExternalsOnly` feature flag).
 */
export interface BridgeHapConfig {
  /**
   * Whether HAP is published for this bridge. Default `true`. Set to `false`
   * to suppress HAP advertisement while preserving pairing data.
   */
  enabled?: boolean
  /**
   * When `true`, the HAP bridge accessory itself is NOT published, but
   * plugins may still publish external HAP accessories (each pairs as its
   * own standalone tile). Requires `enabled: false`.
   */
  externalsOnly?: boolean
}

// --- Accessories types ---

/**
 * Represents a Matter event from the IPC service
 */
export type MatterEvent
  = | { type: 'accessoriesData', correlationId?: string, data: MatterAccessoriesResponse }
    | { type: 'accessoryUpdate', correlationId?: string, data: MatterStateUpdate }
    | { type: 'accessoryAdded', correlationId?: string, data: MatterAccessoryInfo }
    | { type: 'accessoryRemoved', correlationId?: string, data: MatterAccessoryInfo }
    | { type: 'accessoryControlResponse', correlationId?: string, data: MatterControlResponse }
    | { type: 'accessoryInfo', correlationId?: string, data: MatterAccessoryInfo }
    | { type: 'monitoringStarted', correlationId?: string, data: MatterMonitoringAck }
    | { type: 'monitoringStopped', correlationId?: string, data: MatterMonitoringAck }

/**
 * Ack payload for Matter monitoring lifecycle requests.
 *
 * Emitted by Homebridge core in response to `startMatterMonitoring` and
 * `stopMatterMonitoring` IPC calls. The optional booleans describe which
 * branch core took (first/last client vs. piggy-backing on an already-active
 * or already-stopped state) — the UI only needs `success` today, but the
 * shape is captured here to keep IPC contracts honest.
 */
export interface MatterMonitoringAck {
  success: boolean
  alreadyActive?: boolean
  alreadyStopped?: boolean
  othersActive?: boolean
}

/**
 * Response from getMatterAccessories IPC call
 */
export interface MatterAccessoriesResponse {
  accessories?: MatterAccessory[]
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
  fabrics?: MatterFabric[]
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
  fabrics?: MatterFabric[]
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
 * Minimal representation of a Matter fabric.
 *
 * `fabricId` and `nodeId` are strings because Matter IDs are 64-bit and
 * would lose precision as Number — they arrive from Homebridge core
 * already stringified for safe IPC/JSON transport.
 */
export interface MatterFabric {
  fabricIndex: number
  label?: string
  vendorId?: number
  fabricId?: string
  nodeId?: string
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
 * Stored Matter accessory as read from disk (accessories.json)
 */
export interface StoredMatterAccessory {
  uuid: string
  displayName?: string
  plugin?: string
  manufacturer?: string
  model?: string
  serialNumber?: string
  /** Bridge device ID (12 hex chars) — added at read time */
  $deviceId?: string
  /** Protocol marker — added at read time */
  $protocol?: 'matter'
  [key: string]: unknown
}

// --- Status types ---

export interface HomebridgeStatusMatterUpdate {
  enabled: boolean
  port?: number
  setupUri?: string
  pin?: string
  serialNumber?: string
  commissioned?: boolean
  deviceCount?: number
  /**
   * When true, the Matter bridge node itself is not advertised but plugins
   * may still publish external Matter accessories. Only set by Homebridge
   * >= 2.0.3-beta.26 (see the `protocolExternalsOnly` feature flag).
   */
  externalsOnly?: boolean
}

// --- Network overview types ---

/**
 * A single row in the network overview table
 */
export interface NetworkOverviewEntry {
  service: string
  port: number
  protocol: string
  bridge: string
  status: string
  matterPort?: number
  commissioned?: boolean
  deviceCount?: number
}
