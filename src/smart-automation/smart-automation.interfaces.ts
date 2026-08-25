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

export interface HumidityControlConfig {
  id: string
  name: string
  type: 'humidity-control'
  /** The humidity sensor being watched. Only the first entry is used. */
  uniqueIds: string[]
  /** The air conditioner, switch, fan, or thermostat to control. */
  targetUniqueId: string
  /** Turn the target on when humidity rises strictly above this percentage. */
  onHumidity: number
  /** Turn the target off when humidity falls strictly below this percentage. */
  offHumidity: number
  enabled?: boolean
}

export interface AverageTemperatureConfig {
  id: string
  name: string
  type: 'average-temperature'
  /** Temperature services included in the arithmetic mean. */
  uniqueIds: string[]
  enabled?: boolean
}

export type SmartAutomationConfig = SmartLightGroupConfig | DoorAjarConfig | HumidityControlConfig | AverageTemperatureConfig

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
export interface SmartAutomationMonitor<T = any> {
  start: (publish: (value: T) => void) => void
  stop: () => void
}
