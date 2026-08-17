import type { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import type { CharacteristicType } from '@homebridge/hap-client'

import { vi } from 'vitest'

let nextIid = 100

function formatFor(value: boolean | number | string): string {
  if (typeof value === 'boolean') {
    return 'bool'
  }
  if (typeof value === 'number') {
    return 'int'
  }
  return 'string'
}

/**
 * One HAP characteristic, with a `setValue` spy already attached the way
 * `AccessoriesService.generateHelpers` attaches it on the real thing.
 * @param type - the characteristic type, e.g. 'On' or 'Brightness'
 * @param value - its current value
 * @param overrides - fields to change, e.g. minValue / maxValue / perms
 */
export function characteristic(type: string, value: boolean | number | string, overrides: Partial<CharacteristicType> = {}): CharacteristicType {
  return {
    aid: 1,
    iid: nextIid++,
    uuid: `0000-${type}`,
    type,
    serviceType: 'Test',
    serviceName: 'Test Accessory',
    description: type,
    value,
    format: formatFor(value),
    perms: ['pr', 'pw', 'ev'],
    canRead: true,
    canWrite: true,
    ev: true,
    setValue: vi.fn(async () => undefined),
    getValue: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as CharacteristicType
}

export interface HapServiceOptions {
  type?: string
  serviceName?: string
  uniqueId?: string
  characteristics?: CharacteristicType[]
  overrides?: Partial<ServiceTypeX>
}

/**
 * A HAP accessory service as the accessories page sees it, after
 * `generateHelpers` has run: `getCharacteristic(type)` returns the matching
 * characteristic, or null when the accessory does not have it.
 * @param options - see HapServiceOptions
 */
export function hapService(options: HapServiceOptions = {}): ServiceTypeX {
  const type = options.type ?? 'Switch'
  const characteristics = options.characteristics ?? [characteristic('On', false)]

  const service = {
    aid: 1,
    iid: 10,
    uuid: `0000-${type}`,
    type,
    humanType: type,
    serviceName: options.serviceName ?? 'Test Accessory',
    serviceCharacteristics: characteristics,
    accessoryInformation: {
      'Manufacturer': 'Test Manufacturer',
      'Model': 'Test Model',
      'Name': options.serviceName ?? 'Test Accessory',
      'Serial Number': 'TEST-SERIAL',
      'Firmware Revision': '1.0.0',
    },
    values: Object.fromEntries(characteristics.map(char => [char.type, char.value])),
    instance: {
      name: 'Homebridge Test',
      username: '0E:12:34:56:78:9A',
      ipAddress: '127.0.0.1',
      port: 51826,
      services: [],
      connectionFailedCount: 0,
      configurationNumber: 1,
    },
    uniqueId: options.uniqueId ?? 'hap-unique-id',
    getCharacteristic: vi.fn((wanted: string) => characteristics.find(char => char.type === wanted) ?? null),
    refreshCharacteristics: vi.fn(async () => service),
    setCharacteristic: vi.fn(async () => service),
    ...options.overrides,
  } as unknown as ServiceTypeX

  return service
}

export interface MatterServiceOptions {
  deviceType?: string
  serviceName?: string
  uniqueId?: string
  clusters?: Record<string, Record<string, unknown>>
  overrides?: Partial<ServiceTypeX>
}

/** One `setAttributes` call, and the cluster it was made on. */
export interface MatterWrite {
  cluster: string
  attributes: Record<string, unknown>
}

export type MatterServiceFixture = ServiceTypeX & {
  /**
   * Every write, in order, with the cluster it went to. Which cluster a
   * control writes is half of what these functions get wrong - a fan speed
   * written to `levelControl`, a tilt written to the lift attribute - so the
   * cluster name is recorded alongside the payload.
   */
  writes: MatterWrite[]

  /**
   * Make writes to a cluster reject, for the error paths.
   * @param cluster - the cluster name
   * @param error - what the write should reject with
   */
  failWrites: (cluster: string, error: unknown) => void
}

/**
 * A Matter accessory service as the accessories page sees it.
 *
 * `getCluster(name)` returns null for a cluster the device does not have -
 * the asymmetry the matter-device utils rely on.
 * @param options - see MatterServiceOptions
 */
export function matterService(options: MatterServiceOptions = {}): MatterServiceFixture {
  const clusters = options.clusters ?? { onOff: { onOff: false } }
  const writes: MatterWrite[] = []
  const failures = new Map<string, unknown>()
  const writers = new Map<string, (attributes: Record<string, unknown>) => Promise<void>>()

  const writerFor = (name: string) => {
    if (!writers.has(name)) {
      writers.set(name, vi.fn(async (attributes: Record<string, unknown>) => {
        // Recorded before the failure, so a spec can prove what was attempted
        writes.push({ cluster: name, attributes })
        if (failures.has(name)) {
          throw failures.get(name)
        }
      }))
    }
    return writers.get(name)!
  }

  const service = {
    writes,
    failWrites: (cluster: string, error: unknown) => failures.set(cluster, error),
    aid: 1,
    iid: 10,
    uuid: 'matter-uuid',
    type: options.deviceType ?? 'onOffLight',
    humanType: options.deviceType ?? 'onOffLight',
    protocol: 'matter',
    deviceType: options.deviceType ?? 'onOffLight',
    serviceName: options.serviceName ?? 'Test Matter Accessory',
    displayName: options.serviceName ?? 'Test Matter Accessory',
    serviceCharacteristics: [],
    accessoryInformation: {
      'Manufacturer': 'Test Manufacturer',
      'Model': 'Test Model',
      'Name': options.serviceName ?? 'Test Matter Accessory',
      'Serial Number': 'TEST-MATTER-SERIAL',
      'Firmware Revision': '1.0.0',
    },
    values: {},
    clusters,
    partId: 'part-1',
    bridge: { name: 'Matter Bridge', username: '0E:12:34:56:78:9B' },
    instance: {
      name: 'Matter Bridge',
      username: '0E:12:34:56:78:9B',
      ipAddress: '127.0.0.1',
      port: 5540,
      services: [],
      connectionFailedCount: 0,
      configurationNumber: 1,
    },
    uniqueId: options.uniqueId ?? 'matter-unique-id',
    getCluster: vi.fn((name: string) => (clusters[name]
      ? { attributes: clusters[name], setAttributes: writerFor(name) }
      : null)),
    ...options.overrides,
  } as unknown as MatterServiceFixture

  return service
}
