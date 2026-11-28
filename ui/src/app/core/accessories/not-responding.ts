import type { ServiceType } from '@homebridge/hap-client'

type ServiceLike = Partial<Pick<ServiceType, 'serviceCharacteristics'>> | undefined

/**
 * Whether a characteristic answered with a HAP error status (any non-zero code)
 */
export function hasErrorStatus(status: number | undefined): boolean {
  return !!status
}

/**
 * Whether any characteristic of a HAP service answered with a HAP error status
 */
export function isNotResponding(service: ServiceLike): boolean {
  return service?.serviceCharacteristics?.some(c => hasErrorStatus(c.status)) ?? false
}

/**
 * The distinct HAP error statuses of a service, for showing the codes
 */
export function notRespondingCodes(service: ServiceLike): number[] {
  const codes = (service?.serviceCharacteristics ?? [])
    .map(c => c.status)
    .filter((status): status is number => hasErrorStatus(status))
  return [
    ...new Set(codes),
  ]
}

/**
 * Translation keys for the HAP status codes (HAPStatus in HAP-NodeJS). A
 * bridge only sends the number, so the text comes from here.
 */
export const HAP_STATUS_KEYS = new Map<number, string>([
  [-70401, 'accessories.hap_status.insufficient_privileges'],
  [-70402, 'accessories.hap_status.communication_failure'],
  [-70403, 'accessories.hap_status.resource_busy'],
  [-70404, 'accessories.hap_status.read_only'],
  [-70405, 'accessories.hap_status.write_only'],
  [-70406, 'accessories.hap_status.notification_not_supported'],
  [-70407, 'accessories.hap_status.out_of_resource'],
  [-70408, 'accessories.hap_status.timed_out'],
  [-70409, 'accessories.hap_status.does_not_exist'],
  [-70410, 'accessories.hap_status.invalid_value'],
  [-70411, 'accessories.hap_status.insufficient_authorization'],
  [-70412, 'accessories.hap_status.not_allowed'],
])

/**
 * The translation key describing a HAP status code
 */
export function hapStatusKey(status: number | undefined): string {
  return (status !== undefined && HAP_STATUS_KEYS.get(status)) || 'accessories.hap_status.unknown'
}
