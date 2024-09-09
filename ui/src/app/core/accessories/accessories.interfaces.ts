import type { ServiceType } from '@homebridge/hap-client'

export type ServiceTypeX = ServiceType & {
  customName?: string
  hidden?: boolean
  onDashboard?: boolean
}
