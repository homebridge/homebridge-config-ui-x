export enum HomebridgeStatus {
  OK = 'ok',
  PENDING = 'pending',
  DOWN = 'down',
}

export interface HomebridgeStatusMatterUpdate {
  enabled: boolean
  port?: number
  setupUri?: string
  pin?: string
  serialNumber?: string
  commissioned?: boolean
  deviceCount?: number
}

export interface HomebridgeStatusResponse {
  consolePort: number
  port: number
  pin: string
  setupUri: string
  paired: boolean
  packageVersion: string
  status: HomebridgeStatus
  matter?: HomebridgeStatusMatterUpdate
}

export interface ChildBridgeStatusResponse {
  /** Operational status */
  status: HomebridgeStatus

  /** Whether paired (HAP) */
  paired?: boolean | null

  /** HAP setup URI (QR code payload) */
  setupUri?: string | null

  /** Username (MAC address format) */
  username: string

  /** HAP port */
  port?: number

  /** HAP PIN code */
  pin: string

  /** Display name */
  name: string

  /** Plugin identifier */
  plugin: string

  /** Unique identifier for this bridge instance */
  identifier: string

  /** Process ID (if running) */
  pid?: number

  /** Manually stopped flag */
  manuallyStopped: boolean

  /** Matter configuration */
  matterConfig?: {
    port?: number
  }

  /** Matter identifier (filesystem storage key) */
  matterIdentifier?: string

  /** Matter setup URI (QR code payload) */
  matterSetupUri?: string

  /** Matter manual pairing code */
  matterPin?: string

  /** Matter serial number */
  matterSerialNumber?: string

  /** Whether Matter is commissioned */
  matterCommissioned?: boolean

  /** Number of Matter devices */
  matterDeviceCount?: number
}
