import type { HomebridgeStatusMatterUpdate } from '../../core/matter/matter.interfaces.js'

export enum HomebridgeStatus {
  OK = 'ok',
  PENDING = 'pending',
  DOWN = 'down',
}

export interface HomebridgeStatusUpdate {
  status: HomebridgeStatus
  paired?: null | boolean
  setupUri?: null | string
  name?: string
  username?: string
  pin?: string
  matter?: HomebridgeStatusMatterUpdate
}

export interface HomebridgeStatusHapUpdate {
  enabled: boolean
}

export interface HomebridgeStatsResponse {
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
