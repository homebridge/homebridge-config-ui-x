import type { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import type { AccessoryCategory } from '@/app/core/accessories/filters/accessory-categories'

import { getAccessoryCategory } from '@/app/core/accessories/filters/accessory-categories'
import { isMatterService, isServiceOn } from '@/app/core/accessories/filters/service-helpers'
import { controlOnOffDevice, getDoorLockState, isOnOffDevice, isRvcDevice, toggleDoorLock } from '@/app/core/accessories/types/matter/matter-device.utils'

/**
 * Types that open or secure something: read-only on the kiosk unless the tablet allows them.
 * Garage door openers sit in the covers category, so this list is wider than the security category.
 */
const SENSITIVE_TYPES = new Set([
  'LockMechanism',
  'GarageDoorOpener',
  'SecuritySystem',
  'DoorLock',
])

/** Categories with a primary on/off the icon can toggle */
const POWER_CATEGORIES: AccessoryCategory[] = ['lights', 'switches']

/** The type names a service may be known by, most specific first */
function typeNames(service: ServiceTypeX): string[] {
  return isMatterService(service)
    ? [service.customType, service.deviceType, service.type].filter((name): name is string => !!name)
    : [service.customType, service.type, service.deviceType].filter((name): name is string => !!name)
}

export function isSensitiveService(service: ServiceTypeX): boolean {
  return typeNames(service).some(name => SENSITIVE_TYPES.has(name))
}

function matterLockType(service: ServiceTypeX): boolean {
  return (service.customType || service.deviceType) === 'DoorLock'
}

function writeCharacteristic(service: ServiceTypeX, name: string, value: number | boolean): () => Promise<void> {
  return async () => {
    await service.getCharacteristic?.(name)?.setValue?.(value)
  }
}

/**
 * The one change the tile's icon makes, or null when the tile has no primary toggle.
 * Sensitive types have a toggle too: the caller decides whether it may run.
 */
export function kioskToggle(service: ServiceTypeX): (() => Promise<void>) | null {
  if (isMatterService(service)) {
    if (matterLockType(service)) {
      return () => toggleDoorLock(service)
    }
    if (isOnOffDevice(service) && !isRvcDevice(service) && POWER_CATEGORIES.includes(getAccessoryCategory(service))) {
      return () => controlOnOffDevice(service)
    }
    return null
  }

  const values = (service.values ?? {}) as Record<string, unknown>
  if ('LockTargetState' in values) {
    return writeCharacteristic(service, 'LockTargetState', values.LockTargetState ? 0 : 1)
  }
  if ('TargetDoorState' in values) {
    // Closed (1) when open or opening, otherwise open (0)
    const current = values.CurrentDoorState
    const isOpen = current === 0 || current === 3
    return writeCharacteristic(service, 'TargetDoorState', isOpen ? 1 : 0)
  }
  if (!POWER_CATEGORIES.includes(getAccessoryCategory(service))) {
    return null
  }
  if ('On' in values) {
    return writeCharacteristic(service, 'On', !values.On)
  }
  if ('Active' in values) {
    return writeCharacteristic(service, 'Active', values.Active ? 0 : 1)
  }
  return null
}

/** Whether the tile's primary state reads as on (lock: locked, garage: closed) */
export function kioskIsOn(service: ServiceTypeX): boolean {
  if (isMatterService(service) && matterLockType(service)) {
    return getDoorLockState(service) === 1
  }
  const values = (service.values ?? {}) as Record<string, unknown>
  if ('LockCurrentState' in values) {
    return values.LockCurrentState === 1
  }
  return isServiceOn(service)
}

/** Translation key of the state line under the tile name */
export function kioskStateKey(service: ServiceTypeX): string {
  if (isMatterService(service) && matterLockType(service)) {
    const state = getDoorLockState(service)
    return state === 1
      ? 'kiosk.state.locked'
      : state === 2
        ? 'kiosk.state.unlocked'
        : 'kiosk.state.unknown'
  }
  const values = (service.values ?? {}) as Record<string, unknown>
  if ('LockCurrentState' in values) {
    return values.LockCurrentState === 1
      ? 'kiosk.state.locked'
      : values.LockCurrentState === 0
        ? 'kiosk.state.unlocked'
        : 'kiosk.state.unknown'
  }
  if ('CurrentDoorState' in values) {
    const keys: Record<number, string> = {
      0: 'kiosk.state.open',
      1: 'kiosk.state.closing',
      2: 'kiosk.state.closed',
      3: 'kiosk.state.opening',
      4: 'kiosk.state.stopped',
    }
    return keys[values.CurrentDoorState as number] ?? 'kiosk.state.unknown'
  }
  if ('SecuritySystemCurrentState' in values) {
    const state = values.SecuritySystemCurrentState
    return state === 3
      ? 'kiosk.state.disarmed'
      : state === 4
        ? 'kiosk.state.alarm'
        : 'kiosk.state.armed'
  }
  return kioskIsOn(service)
    ? 'accessories.control.on'
    : 'accessories.control.off'
}

/** Font Awesome class for the tile icon, by category */
const CATEGORY_ICON: Record<AccessoryCategory, string> = {
  lights: 'fa-lightbulb',
  switches: 'fa-plug',
  climate: 'fa-temperature-half',
  covers: 'fa-table-cells',
  security: 'fa-shield-halved',
  sensors: 'fa-gauge-high',
  media: 'fa-tv',
  other: 'fa-circle-question',
}

export function kioskIconClass(service: ServiceTypeX): string {
  if (isSensitiveService(service)) {
    return typeNames(service).some(name => name === 'LockMechanism' || name === 'DoorLock')
      ? 'fa-lock'
      : CATEGORY_ICON[getAccessoryCategory(service)]
  }
  return CATEGORY_ICON[getAccessoryCategory(service)]
}
