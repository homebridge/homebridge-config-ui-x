import type { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import type { CharacteristicType } from '@homebridge/hap-client'

import { characteristic, hapService } from '@/testing'

export interface HapFixtureOptions {
  type: string
  aid?: number
  bridge?: string
  uniqueId?: string
  customName?: string
  customType?: string
  hidden?: boolean
  onDashboard?: boolean
  manufacturer?: string
  characteristics?: CharacteristicType[]
}

/** A HAP service with the given type. Values come from the characteristics passed in. */
export function hap(options: HapFixtureOptions): ServiceTypeX {
  const service = hapService({
    type: options.type,
    serviceName: options.type,
    uniqueId: options.uniqueId ?? `hap:${options.bridge ?? 'bridge'}:${options.aid ?? 1}:${options.type}`,
    characteristics: options.characteristics ?? [
      characteristic('On', false),
    ],
  }) as ServiceTypeX

  service.aid = options.aid ?? 1
  service.instance = { ...service.instance, username: options.bridge ?? 'AA:BB:CC:DD:EE:FF' }
  service.customName = options.customName
  service.customType = options.customType
  service.hidden = options.hidden
  service.onDashboard = options.onDashboard
  if (options.manufacturer) {
    service.accessoryInformation = { ...service.accessoryInformation, Manufacturer: options.manufacturer }
  }
  return service
}

export interface MatterFixtureOptions {
  deviceType: string
  uniqueId?: string
  customName?: string
  customType?: string
  hidden?: boolean
  onDashboard?: boolean
  clusters?: Record<string, unknown>
}

/** A Matter service with the given device type */
export function matter(options: MatterFixtureOptions): ServiceTypeX {
  return {
    aid: 1,
    iid: 1,
    uuid: `matter-${options.deviceType}`,
    type: '',
    humanType: options.deviceType,
    serviceName: options.deviceType,
    serviceCharacteristics: [],
    accessoryInformation: {},
    values: {},
    instance: { name: 'Matter', username: 'MATTER-BRIDGE' } as ServiceTypeX['instance'],
    protocol: 'matter',
    uniqueId: options.uniqueId ?? `matter:${options.deviceType}:${Math.random().toString(36).slice(2)}`,
    deviceType: options.deviceType,
    customName: options.customName,
    customType: options.customType,
    hidden: options.hidden,
    onDashboard: options.onDashboard,
    clusters: options.clusters as ServiceTypeX['clusters'],
  } as ServiceTypeX
}

/** A HAP Battery service with the given values, on the same accessory as its sensor */
export function batteryService(options: { aid?: number, bridge?: string, level?: number, low?: boolean, charging?: boolean }): ServiceTypeX {
  const characteristics = [
    characteristic('BatteryLevel', options.level ?? 100),
    characteristic('StatusLowBattery', options.low ? 1 : 0),
    characteristic('ChargingState', options.charging ? 1 : 2),
  ]
  return hap({
    type: 'Battery',
    aid: options.aid,
    bridge: options.bridge,
    uniqueId: `battery:${Math.random().toString(36).slice(2)}`,
    characteristics,
  })
}
