import type { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

import type { BatteryInfo } from './accessory-battery'

import { getAccessoryCategory } from './accessory-categories'
import { isServiceOn } from './service-helpers'

export interface RoomSummary {
  lightsOn: number
  /** Average of the temperature sensors in the room, to 1 decimal place */
  avgTemperature?: number
  lowBattery: number
}

/** Temperature of a service in degrees C, from HAP CurrentTemperature or Matter TemperatureMeasurement */
function temperatureOf(service: ServiceTypeX): number | undefined {
  const hap = (service.values as Record<string, unknown> | undefined)?.CurrentTemperature
  if (typeof hap === 'number') {
    return hap
  }
  const matter = (service.clusters as Record<string, unknown> | undefined)?.temperatureMeasurement as { measuredValue?: number | null } | undefined
  return typeof matter?.measuredValue === 'number'
    ? matter.measuredValue / 100
    : undefined
}

/** Counts and averages for the services in one room (pass the services already filtered for display) */
export function summarizeRoom(services: ServiceTypeX[], batteryIndex: Map<string, BatteryInfo>): RoomSummary {
  let lightsOn = 0
  let lowBattery = 0
  const temperatures: number[] = []

  for (const service of services) {
    if (getAccessoryCategory(service) === 'lights' && isServiceOn(service)) {
      lightsOn++
    }
    if (batteryIndex.get(service.uniqueId ?? '')?.low) {
      lowBattery++
    }
    const temperature = temperatureOf(service)
    if (temperature !== undefined) {
      temperatures.push(temperature)
    }
  }

  const summary: RoomSummary = { lightsOn, lowBattery }
  if (temperatures.length) {
    const average = temperatures.reduce((sum, value) => sum + value, 0) / temperatures.length
    summary.avgTemperature = Math.round(average * 10) / 10
  }
  return summary
}
