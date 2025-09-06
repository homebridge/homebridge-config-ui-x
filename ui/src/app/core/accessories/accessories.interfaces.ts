import type { ServiceType } from '@homebridge/hap-client'

export type AccessoryLayout = {
  name: string
  services: Array<{
    aid: number
    iid: number
    uuid: string
    uniqueId: string
    name: string
    serial: string
    bridge: string
    customName?: string
    customType?: string
    hidden?: boolean
    onDashboard?: boolean
  }>
}[]

export type ServiceTypeX = ServiceType & {
  customName?: string
  customType?: string
  hidden?: boolean
  onDashboard?: boolean
}
