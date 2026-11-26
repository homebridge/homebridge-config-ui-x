import type { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

/**
 * Low battery detection for the accessory tiles and the accessory info popup.
 * A trimmed copy of the battery reading in the alpha branch
 * (filters/accessory-battery.ts), so the two can be merged later.
 */

/** A battery below this charge, in percent, counts as low even when the device does not flag it */
export const LOW_BATTERY_PERCENT = 20

const BATTERY_TYPES = new Set(['Battery', 'BatteryService'])
const HAP_BATTERY_KEYS = ['BatteryLevel', 'StatusLowBattery']

/** Matter PowerSource cluster, as far as the low flag needs it */
interface MatterPowerSourceCluster {
  batPercentRemaining?: number | null // half-percent units, 0-200
  batChargeLevel?: number | null // 0=OK, 1=Warning, 2=Critical
}

function isLowPercent(level: unknown): boolean {
  return typeof level === 'number' && level < LOW_BATTERY_PERCENT
}

function isMatterService(service: ServiceTypeX): boolean {
  return service.protocol === 'matter' || service.uniqueId?.startsWith('matter:') === true
}

/** The bridge username a service belongs to, or '' when unknown */
function serviceBridgeKey(service: ServiceTypeX): string {
  const bridge = service.bridge as unknown
  if (typeof bridge === 'string') {
    return bridge
  }
  return (bridge as { username?: string } | undefined)?.username
    ?? service.instance?.username
    ?? ''
}

/** Identifies the HAP accessory a service belongs to: its bridge username and aid */
function accessoryKey(service: ServiceTypeX): string {
  return `${serviceBridgeKey(service)}|${service.aid}`
}

function powerSourceOf(service: ServiceTypeX): MatterPowerSourceCluster | undefined {
  return (service.clusters as Record<string, unknown> | undefined)?.powerSource as MatterPowerSourceCluster | undefined
}

function isHapBatteryService(service: ServiceTypeX): boolean {
  return BATTERY_TYPES.has(service.type)
}

/** Whether a HAP service's own battery characteristics report a low battery */
function isHapLow(service: ServiceTypeX): boolean {
  const values = service.values as Record<string, unknown> | undefined
  return values?.StatusLowBattery === 1 || isLowPercent(values?.BatteryLevel)
}

function isMatterLow(service: ServiceTypeX): boolean {
  const powerSource = powerSourceOf(service)
  return powerSource?.batChargeLevel === 1
    || powerSource?.batChargeLevel === 2
    || (typeof powerSource?.batPercentRemaining === 'number' && isLowPercent(powerSource.batPercentRemaining / 2))
}

/**
 * The uniqueIds of the services to mark with a low battery icon.
 *
 * Low means the device flags it (HAP StatusLowBattery, Matter charge level
 * Warning or Critical) or the charge is under LOW_BATTERY_PERCENT.
 *
 * - Matter: a service whose own Power Source cluster says low.
 * - HAP: a service whose own BatteryLevel or StatusLowBattery says low.
 * - HAP: a separate Battery service that says low marks every other service
 *   of the same accessory (same bridge username and aid), and itself.
 *
 * Services without battery characteristics are never marked.
 */
export function buildLowBatterySet(services: ServiceTypeX[]): Set<string> {
  const low = new Set<string>()
  const accessories = new Map<string, ServiceTypeX[]>()

  for (const service of services) {
    if (!service.uniqueId) {
      continue
    }
    if (isMatterService(service)) {
      if (isMatterLow(service)) {
        low.add(service.uniqueId)
      }
      continue
    }
    const key = accessoryKey(service)
    const list = accessories.get(key) ?? []
    list.push(service)
    accessories.set(key, list)
  }

  for (const list of accessories.values()) {
    const accessoryLow = list.some(service => isHapBatteryService(service) && isHapLow(service))
    for (const service of list) {
      if (accessoryLow || isHapLow(service)) {
        low.add(service.uniqueId!)
      }
    }
  }

  return low
}

/** Whether one characteristic row reports a low battery, for highlighting it */
export function isLowBatteryCharacteristic(characteristic: { type?: string, value?: unknown }): boolean {
  return (characteristic.type === 'StatusLowBattery' && characteristic.value === 1)
    || (characteristic.type === 'BatteryLevel' && isLowPercent(characteristic.value))
}

export interface BatterySummary {
  /** Charge in percent, when known */
  level?: number
  low: boolean
}

/**
 * The battery state of one accessory, from all of its services: the lowest
 * level and any low flag. Undefined when the accessory reports no battery.
 * Matter reports the charge in half-percent units (0-200).
 */
export function batterySummary(services: ServiceTypeX[]): BatterySummary | undefined {
  const levels: number[] = []
  let low = false
  let found = false
  for (const service of services) {
    if (isMatterService(service)) {
      const powerSource = powerSourceOf(service)
      if (powerSource) {
        if (typeof powerSource.batPercentRemaining === 'number') {
          levels.push(powerSource.batPercentRemaining / 2)
          found = true
        }
        if (typeof powerSource.batChargeLevel === 'number') {
          found = true
        }
        low ||= isMatterLow(service)
      }
      continue
    }
    const values = service.values as Record<string, unknown> | undefined
    if (typeof values?.BatteryLevel === 'number') {
      levels.push(values.BatteryLevel)
      found = true
    }
    if (values && 'StatusLowBattery' in values) {
      found = true
    }
    low ||= isHapLow(service)
  }
  if (!found) {
    return undefined
  }
  return {
    level: levels.length
      ? Math.min(...levels)
      : undefined,
    low,
  }
}

/** The services of the same HAP accessory (same bridge username and aid) as the given one, itself included */
export function sameAccessoryServices(services: ServiceTypeX[], service: ServiceTypeX): ServiceTypeX[] {
  if (isMatterService(service)) {
    return [service]
  }
  const key = accessoryKey(service)
  return services.filter(other => !isMatterService(other) && accessoryKey(other) === key)
}

/** Whether a HAP service carries battery characteristics of its own */
export function hasHapBatteryValues(service: ServiceTypeX): boolean {
  if (isMatterService(service)) {
    return false
  }
  const values = service.values as Record<string, unknown> | undefined
  return HAP_BATTERY_KEYS.some(key => values && key in values)
    || (service.serviceCharacteristics ?? []).some(characteristic => HAP_BATTERY_KEYS.includes(characteristic.type))
}
