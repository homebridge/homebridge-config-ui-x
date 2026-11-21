import type { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

import { isNotResponding } from '@/app/core/accessories/not-responding'
import { getDeviceActiveState } from '@/app/core/accessories/types/matter/matter-device.utils'

/** True for a Matter service (the backend marks these with `protocol` or a `matter:` uniqueId) */
export function isMatterService(service: ServiceTypeX): boolean {
  return service.protocol === 'matter' || service.uniqueId?.startsWith('matter:') === true
}

/** The bridge username a service belongs to, or '' when unknown */
export function serviceBridgeKey(service: ServiceTypeX): string {
  const bridge = service.bridge as unknown
  if (typeof bridge === 'string') {
    return bridge
  }
  return (bridge as { username?: string } | undefined)?.username
    ?? service.instance?.username
    ?? ''
}

/**
 * The bridge name for display: the name the bridge advertises (main bridge or child bridge), from the
 * HAP instance. Matter services may lack an instance, so their bridge name is used next, then the username.
 */
export function serviceBridgeName(service: ServiceTypeX): string {
  const bridge = service.bridge as unknown
  return service.instance?.name
    || (typeof bridge === 'string'
      ? bridge
      : (bridge as { name?: string } | undefined)?.name)
    || serviceBridgeKey(service)
}

/** The name the user sees: the custom name when set, otherwise the service name */
export function serviceDisplayName(service: ServiceTypeX): string {
  return (service.customName || service.serviceName || '').trim()
}

/** The primary on/active state of a service */
export function isServiceOn(service: ServiceTypeX): boolean {
  if (isMatterService(service)) {
    return getDeviceActiveState(service)
  }
  const values = service.values as Record<string, unknown> | undefined
  return Boolean(values?.On || values?.Active)
}

/** True when any characteristic of the service answered with a HAP error status */
export function isServiceNotResponding(service: ServiceTypeX): boolean {
  return isNotResponding(service)
}
