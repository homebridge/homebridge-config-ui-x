/**
 * Child Bridge Types
 *
 * These types define the interfaces for child bridge communication
 * between the UI and homebridge core.
 * Child bridges can have both HAP and optional Matter functionality.
 */
import { BridgeHapConfig, MatterConfig } from '../../core/matter/matter.interfaces.js'

export type BridgeStatus = 'pending' | 'ok' | 'down'

/**
 * Child bridge metadata (unified HAP + optional Matter)
 * This represents a child bridge that always runs HAP, and optionally
 * can also expose devices via Matter when matterConfig is present.
 */
export interface ChildBridgeMetadata {
  /** Operational status */
  status: BridgeStatus

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
   * HAP configuration for this child bridge. Older Homebridge versions sent a
   * boolean (`true`/`false`/undefined for the default-on). Homebridge
   * >= 2.0.3-beta.26 sends the nested object form (`{ enabled?, externalsOnly? }`).
   * Both shapes are typed here so the metadata passes through unchanged to the
   * UI, which decides which shape is authoritative via the `protocolExternalsOnly`
   * feature flag.
   */
  hap?: boolean | BridgeHapConfig

  /** Matter configuration */
  matterConfig?: MatterConfig

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
