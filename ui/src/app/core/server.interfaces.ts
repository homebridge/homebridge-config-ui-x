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
  /**
   * When true, the Matter bridge node itself is not advertised but plugins
   * may still publish external Matter accessories. Only set by Homebridge
   * >= 2.0.3-beta.26.
   */
  externalsOnly?: boolean
}

export interface HomebridgeStatusHapUpdate {
  enabled: boolean
  /** When true, the bridge accessory itself is not published but plugins may still publish external HAP accessories. */
  externalsOnly?: boolean
}

export interface HomebridgeStatusResponse {
  consolePort: number
  port: number
  pin: string
  setupUri: string
  paired: boolean
  packageVersion: string
  status: HomebridgeStatus
  hap?: HomebridgeStatusHapUpdate
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

  /**
   * HAP configuration for this child bridge.
   *
   * Older Homebridge versions used a boolean (`true`/`false`/undefined for default).
   * Homebridge >= 2.0.3-beta.26 sends the nested object form. Newer runtimes
   * may include `externalsOnly` and `disableIdentifyingMaterial`. Both shapes
   * are typed here so the UI can render against either; feature flags decide
   * which properties are available at runtime.
   */
  hap?: boolean | { enabled?: boolean, externalsOnly?: boolean, disableIdentifyingMaterial?: boolean }

  /** Matter configuration */
  matterConfig?: {
    port?: number
    /** When false, Matter is configured but disabled in place (storage preserved). */
    enabled?: boolean
    /** When true, the Matter bridge node itself is not advertised but plugins may publish external Matter accessories. */
    externalsOnly?: boolean
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
