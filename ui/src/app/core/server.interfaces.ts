export enum HomebridgeStatus {
  OK = 'ok',
  PENDING = 'pending',
  DOWN = 'down',
}

export interface HomebridgeStatusResponse {
  consolePort: number
  port: number
  pin: string
  setupUri: string
  paired: boolean
  packageVersion: string
  status: HomebridgeStatus
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
}
