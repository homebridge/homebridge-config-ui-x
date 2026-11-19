import type { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

import { getAccessoryCategory } from './accessory-categories'
import { isMatterService, serviceBridgeKey } from './service-helpers'

export interface BatteryInfo {
  /** Charge in percent, when known */
  level?: number
  low: boolean
  charging: boolean
}

export type BatteryBucket = 'low' | 'under20' | 'charging' | 'ok'

/** Matter PowerSource cluster, as far as the battery reading needs it */
interface MatterPowerSourceCluster {
  batPercentRemaining?: number | null // half-percent units, 0-200
  batChargeLevel?: number | null // 0=OK, 1=Warning, 2=Critical
  batChargeState?: number | null // 0=Unknown, 1=IsCharging, 2=IsAtFullCharge, 3=IsNotCharging
}

const BATTERY_TYPES = new Set(['Battery', 'BatteryService'])
const HAP_BATTERY_KEYS = ['BatteryLevel', 'StatusLowBattery', 'ChargingState']

function isHapBatteryService(service: ServiceTypeX): boolean {
  return !isMatterService(service) && BATTERY_TYPES.has(service.type)
}

/** Reads the battery characteristics of a HAP service */
function fromHapValues(values: Record<string, unknown> | undefined): BatteryInfo {
  const level = typeof values?.BatteryLevel === 'number'
    ? values.BatteryLevel
    : undefined
  return {
    level,
    low: values?.StatusLowBattery === 1 || level === 0,
    charging: values?.ChargingState === 1,
  }
}

/** Reads the Power Source cluster of a Matter service, if it has one */
function fromMatterPowerSource(service: ServiceTypeX): BatteryInfo | undefined {
  const powerSource = (service.clusters as Record<string, unknown> | undefined)?.powerSource as MatterPowerSourceCluster | undefined
  if (!powerSource) {
    return undefined
  }
  const percent = typeof powerSource.batPercentRemaining === 'number'
    ? powerSource.batPercentRemaining
    : undefined
  return {
    level: percent === undefined
      ? undefined
      : percent / 2,
    low: powerSource.batChargeLevel === 1 || powerSource.batChargeLevel === 2,
    charging: powerSource.batChargeState === 1,
  }
}

/** Combines two readings for the same device: lowest level, and any low or charging flag */
function merge(a: BatteryInfo | undefined, b: BatteryInfo): BatteryInfo {
  if (!a) {
    return { ...b }
  }
  const levels = [a.level, b.level].filter((level): level is number => level !== undefined)
  return {
    level: levels.length
      ? Math.min(...levels)
      : undefined,
    low: a.low || b.low,
    charging: a.charging || b.charging,
  }
}

/**
 * Battery state for every service that has one, keyed by the service's uniqueId.
 *
 * - Matter: a service's own Power Source cluster.
 * - HAP: a separate Battery service on the same accessory (same bridge username and aid)
 *   is attached to one non-battery service of that accessory. Sensors and security
 *   devices are preferred, otherwise the first service is used.
 * - HAP: a service with its own BatteryLevel, StatusLowBattery or ChargingState uses those.
 */
export function buildBatteryIndex(services: ServiceTypeX[]): Map<string, BatteryInfo> {
  const index = new Map<string, BatteryInfo>()

  // Group HAP services by accessory
  const accessories = new Map<string, ServiceTypeX[]>()
  for (const service of services) {
    if (isMatterService(service)) {
      const info = fromMatterPowerSource(service)
      if (info && service.uniqueId) {
        index.set(service.uniqueId, merge(index.get(service.uniqueId), info))
      }
      continue
    }
    const key = `${serviceBridgeKey(service)}|${service.aid}`
    const list = accessories.get(key) ?? []
    list.push(service)
    accessories.set(key, list)
  }

  for (const list of accessories.values()) {
    const batteryServices = list.filter(isHapBatteryService)
    const parents = list.filter(service => !isHapBatteryService(service) && service.uniqueId)

    // The battery reading that belongs to the accessory, from its separate Battery services
    let accessoryBattery: BatteryInfo | undefined
    for (const batteryService of batteryServices) {
      accessoryBattery = merge(accessoryBattery, fromHapValues(batteryService.values))
    }

    if (accessoryBattery && parents.length) {
      const parent = parents.find(service => ['sensors', 'security'].includes(getAccessoryCategory(service)))
        ?? parents.find(service => !service.hidden)
        ?? parents[0]
      index.set(parent.uniqueId!, merge(index.get(parent.uniqueId!), accessoryBattery))
    }

    // Battery characteristics on a service's own values
    for (const service of parents) {
      const values = service.values as Record<string, unknown> | undefined
      if (HAP_BATTERY_KEYS.some(key => values && key in values)) {
        index.set(service.uniqueId!, merge(index.get(service.uniqueId!), fromHapValues(values)))
      }
    }
  }

  return index
}

/**
 * The single state a tile is shown in. Low comes first, then under 20%,
 * then charging. Everything else is 'ok'.
 */
export function batteryBucket(info: BatteryInfo): BatteryBucket {
  if (info.low) {
    return 'low'
  }
  if (info.level !== undefined && info.level < 20) {
    return 'under20'
  }
  if (info.charging) {
    return 'charging'
  }
  return 'ok'
}
