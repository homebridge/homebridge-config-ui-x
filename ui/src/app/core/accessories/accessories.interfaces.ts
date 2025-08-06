import type { ServiceType } from '@homebridge/hap-client'

export interface AccessoryData {
  services: ServiceType[]
}

export type ServiceTypeX = ServiceType & {
  customName?: string
  customType?: string
  hidden?: boolean
  onDashboard?: boolean
}

export interface LiveLayoutRoom {
  name: string
  services: ServiceTypeX[]
}

export interface CacheLayoutService {
  aid: number
  iid: number
  uuid: string
  uniqueId: string
  customName?: string
  customType?: string
  hidden?: boolean
  onDashboard?: boolean
}

export interface CacheLayoutRoom {
  name: string
  services: CacheLayoutService[]
}
