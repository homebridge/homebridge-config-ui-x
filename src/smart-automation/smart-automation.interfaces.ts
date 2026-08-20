import type { ServiceType } from '@homebridge/hap-client'

export interface SmartLightGroupConfig {
  id: string
  name: string
  type: 'smart-light-group'
  uniqueIds: string[]
  lightbulbType: 'on-off' | 'dimmable' | 'colour' | 'temperature'
  enabled?: boolean
}

export interface DoorAjarConfig {
  id: string
  name: string
  type: 'door-ajar'
  /** The door being watched. Only the first entry is used. */
  uniqueIds: string[]
  /** How long the door may stay open before the sensor trips, in minutes. */
  openMinutes: number
  /** How often to trip it again while the door stays open, in minutes. */
  repeatMinutes: number
  enabled?: boolean
}

export type SmartAutomationConfig = SmartLightGroupConfig | DoorAjarConfig

export interface SmartAutomationAccessoryController {
  getServices: () => Promise<ServiceType[]>
}

export interface SmartAutomationRulesEngine {
  setOn: (value: boolean) => Promise<void>
  setCharacteristic: (type: string, value: string | number | boolean) => Promise<void>
}

/**
 * An automation that watches accessories rather than being driven by one.
 *
 * The published accessory is an output: the engine decides what it should read
 * and calls `publish`, rather than HomeKit calling in.
 */
export interface SmartAutomationMonitor {
  start: (publish: (tripped: boolean) => void) => void
  stop: () => void
}
