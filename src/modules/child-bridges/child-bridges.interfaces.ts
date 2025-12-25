/**
 * Child Bridge Types
 *
 * These types define the interfaces for child bridge communication
 * between the UI and homebridge core.
 */

export type BridgeStatus = 'pending' | 'ok' | 'down'

/**
 * Child bridge metadata
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
}
