import type { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

import { describe, expect, it } from 'vitest'

import { batterySummary, buildLowBatterySet, hasHapBatteryValues, isLowBatteryCharacteristic, sameAccessoryServices } from '@/app/core/accessories/low-battery'

describe('buildLowBatterySet', () => {
  it('HAP service with values StatusLowBattery 1 is in the set', () => {
    const services = [
      {
        type: 'Service',
        aid: 2,
        uniqueId: 'hap:1:2',
        bridge: { username: 'AA' },
        values: { StatusLowBattery: 1 },
      },
    ]
    const set = buildLowBatterySet(services as unknown as ServiceTypeX[])
    expect(set.has('hap:1:2')).toBe(true)
  })

  it('values BatteryLevel 0 is in the set', () => {
    const services = [
      {
        type: 'Service',
        aid: 2,
        uniqueId: 'hap:1:2',
        bridge: { username: 'AA' },
        values: { BatteryLevel: 0 },
      },
    ]
    const set = buildLowBatterySet(services as unknown as ServiceTypeX[])
    expect(set.has('hap:1:2')).toBe(true)
  })

  it('values StatusLowBattery 0 and BatteryLevel 50 is not in the set', () => {
    const services = [
      {
        type: 'Service',
        aid: 2,
        uniqueId: 'hap:1:2',
        bridge: { username: 'AA' },
        values: { StatusLowBattery: 0, BatteryLevel: 50 },
      },
    ]
    const set = buildLowBatterySet(services as unknown as ServiceTypeX[])
    expect(set.has('hap:1:2')).toBe(false)
  })

  it('service with no battery values is not in the set', () => {
    const services = [
      {
        type: 'Service',
        aid: 2,
        uniqueId: 'hap:1:2',
        bridge: { username: 'AA' },
        values: { On: true },
      },
    ]
    const set = buildLowBatterySet(services as unknown as ServiceTypeX[])
    expect(set.has('hap:1:2')).toBe(false)
  })

  it('Battery service and ContactSensor with same aid and bridge both in the set', () => {
    const services = [
      {
        type: 'Battery',
        aid: 2,
        uniqueId: 'hap:1:2',
        bridge: { username: 'AA' },
        values: { StatusLowBattery: 1 },
      },
      {
        type: 'ContactSensor',
        aid: 2,
        uniqueId: 'hap:1:3',
        bridge: { username: 'AA' },
        values: { ContactSensorState: 1 },
      },
    ]
    const set = buildLowBatterySet(services as unknown as ServiceTypeX[])
    expect(set.has('hap:1:2')).toBe(true)
    expect(set.has('hap:1:3')).toBe(true)
  })

  it('Battery and ContactSensor with different aid only battery in the set', () => {
    const services = [
      {
        type: 'Battery',
        aid: 2,
        uniqueId: 'hap:1:2',
        bridge: { username: 'AA' },
        values: { StatusLowBattery: 1 },
      },
      {
        type: 'ContactSensor',
        aid: 3,
        uniqueId: 'hap:1:3',
        bridge: { username: 'AA' },
        values: { ContactSensorState: 1 },
      },
    ]
    const set = buildLowBatterySet(services as unknown as ServiceTypeX[])
    expect(set.has('hap:1:2')).toBe(true)
    expect(set.has('hap:1:3')).toBe(false)
  })

  it('Matter service with batChargeLevel 2 is in the set and batChargeLevel 0 is not', () => {
    const services = [
      {
        type: 'Service',
        aid: 2,
        uniqueId: 'hap:1:2',
        protocol: 'matter',
        bridge: { username: 'AA' },
        clusters: {
          powerSource: {
            batChargeLevel: 2,
          },
        },
      },
      {
        type: 'Service',
        aid: 3,
        uniqueId: 'hap:1:3',
        protocol: 'matter',
        bridge: { username: 'AA' },
        clusters: {
          powerSource: {
            batChargeLevel: 0,
          },
        },
      },
    ]
    const set = buildLowBatterySet(services as unknown as ServiceTypeX[])
    expect(set.has('hap:1:2')).toBe(true)
    expect(set.has('hap:1:3')).toBe(false)
  })

  it('service without uniqueId is ignored', () => {
    const services = [
      {
        type: 'Service',
        aid: 2,
        bridge: { username: 'AA' },
        values: { StatusLowBattery: 1 },
      },
    ]
    const set = buildLowBatterySet(services as unknown as ServiceTypeX[])
    expect(set.size).toBe(0)
  })
})

describe('isLowBatteryCharacteristic', () => {
  it('flags StatusLowBattery 1 and a BatteryLevel under 20', () => {
    expect(isLowBatteryCharacteristic({ type: 'StatusLowBattery', value: 1 })).toBe(true)
    expect(isLowBatteryCharacteristic({ type: 'BatteryLevel', value: 0 })).toBe(true)
    expect(isLowBatteryCharacteristic({ type: 'StatusLowBattery', value: 0 })).toBe(false)
    expect(isLowBatteryCharacteristic({ type: 'BatteryLevel', value: 19 })).toBe(true)
    expect(isLowBatteryCharacteristic({ type: 'BatteryLevel', value: 20 })).toBe(false)
    expect(isLowBatteryCharacteristic({ type: 'On', value: 1 })).toBe(false)
  })
})

describe('batterySummary', () => {
  const svc = (s: object) => s as unknown as ServiceTypeX

  it('is undefined without battery characteristics', () => {
    expect(batterySummary([
      svc({
        type: 'Switch',
        values: { On: true },
      }),
    ])).toBeUndefined()
  })

  it('takes the lowest HAP level and any low flag across services', () => {
    expect(batterySummary([
      svc({
        type: 'ContactSensor',
        values: { ContactSensorState: 0 },
      }),
      svc({
        type: 'Battery',
        values: { BatteryLevel: 8, StatusLowBattery: 1 },
      }),
      svc({
        type: 'Battery',
        values: { BatteryLevel: 50, StatusLowBattery: 0 },
      }),
    ])).toEqual({ level: 8, low: true })
  })

  it('reports a low flag without a level', () => {
    expect(batterySummary([
      svc({
        type: 'TemperatureSensor',
        values: { StatusLowBattery: 1 },
      }),
    ])).toEqual({ level: undefined, low: true })
  })

  it('converts the matter half-percent charge to percent', () => {
    expect(batterySummary([
      svc({
        protocol: 'matter',
        clusters: {
          powerSource: { batPercentRemaining: 150, batChargeLevel: 0 },
        },
      }),
    ]))
      .toEqual({ level: 75, low: false })
  })
})

describe('sameAccessoryServices', () => {
  const svc = (s: object) => s as unknown as ServiceTypeX

  it('keeps the services with the same bridge and aid', () => {
    const a = svc({
      uniqueId: 'a',
      aid: 2,
      bridge: { username: 'AA' },
    })
    const b = svc({
      uniqueId: 'b',
      aid: 2,
      bridge: { username: 'AA' },
    })
    const c = svc({
      uniqueId: 'c',
      aid: 3,
      bridge: { username: 'AA' },
    })
    const d = svc({
      uniqueId: 'd',
      aid: 2,
      bridge: { username: 'BB' },
    })
    expect(sameAccessoryServices([a, b, c, d], a)).toEqual([a, b])
  })
})

describe('the under 20% rule', () => {
  const hap = (values: object) => ({
    uniqueId: 'u',
    type: 'Battery',
    aid: 2,
    bridge: { username: 'AA' },
    values,
  }) as unknown as ServiceTypeX
  const matter = (batPercentRemaining: number) => ({
    uniqueId: 'matter:1',
    protocol: 'matter',
    clusters: {
      powerSource: { batPercentRemaining, batChargeLevel: 0 },
    },
  }) as unknown as ServiceTypeX

  it('marks a HAP battery under 20% that the device does not flag', () => {
    expect(buildLowBatterySet([
      hap({ BatteryLevel: 19, StatusLowBattery: 0 }),
    ]).has('u')).toBe(true)
    expect(buildLowBatterySet([
      hap({ BatteryLevel: 20, StatusLowBattery: 0 }),
    ]).has('u')).toBe(false)
  })

  it('marks a matter battery under 20% (38 half-percent units)', () => {
    expect(buildLowBatterySet([
      matter(38),
    ]).has('matter:1')).toBe(true)
    expect(buildLowBatterySet([
      matter(40),
    ]).has('matter:1')).toBe(false)
  })

  it('reports it as low in the summary', () => {
    expect(batterySummary([
      hap({ BatteryLevel: 12, StatusLowBattery: 0 }),
    ])).toEqual({ level: 12, low: true })
  })
})

describe('hasHapBatteryValues', () => {
  it('is true only for a HAP service with battery characteristics', () => {
    expect(hasHapBatteryValues({
      type: 'TemperatureSensor',
      values: { StatusLowBattery: 0 },
    } as unknown as ServiceTypeX)).toBe(true)
    expect(hasHapBatteryValues({
      type: 'Switch',
      values: { On: true },
    } as unknown as ServiceTypeX)).toBe(false)
    expect(hasHapBatteryValues({
      protocol: 'matter',
      values: { BatteryLevel: 5 },
    } as unknown as ServiceTypeX)).toBe(false)
  })
})
