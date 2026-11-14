import type { ServiceType } from '@homebridge/hap-client'

/**
 * HAP statuses that mean the device did not answer: -70402 (service
 * communication failure, which plugins use for "No Response") and -70408
 * (operation timed out). Others, such as read-only or busy, are not offline.
 */
export const NOT_RESPONDING_STATUSES = new Set([-70402, -70408])

/**
 * Whether any characteristic of a HAP service answered with a not responding status
 */
export function isNotResponding(service: Partial<Pick<ServiceType, 'serviceCharacteristics'>> | undefined): boolean {
  return service?.serviceCharacteristics?.some(c => c.status !== undefined && NOT_RESPONDING_STATUSES.has(c.status)) ?? false
}

/**
 * The distinct not responding HAP statuses of a service, for showing the code
 */
export function notRespondingCodes(service: Partial<Pick<ServiceType, 'serviceCharacteristics'>> | undefined): number[] {
  const codes = (service?.serviceCharacteristics ?? [])
    .map(c => c.status)
    .filter((status): status is number => status !== undefined && NOT_RESPONDING_STATUSES.has(status))
  return [
    ...new Set(codes),
  ]
}
