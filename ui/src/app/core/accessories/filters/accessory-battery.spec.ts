import { describe, expect, it } from 'vitest'

import { batteryBucket, buildBatteryIndex } from '@/app/core/accessories/filters/accessory-battery'
import { characteristic } from '@/testing'

import { batteryService, hap, matter } from './accessory-filter.fixture'

describe('buildBatteryIndex', () => {
  it('joins a separate HAP Battery service to the sensor on the same accessory', () => {
    const sensor = hap({ type: 'ContactSensor', aid: 2, uniqueId: 'sensor' })
    const other = hap({ type: 'Switch', aid: 3, uniqueId: 'other' })
    const battery = batteryService({ aid: 2, level: 15, low: true })

    const index = buildBatteryIndex([other, battery, sensor])

    expect(index.get('sensor')).toEqual({ level: 15, low: true, charging: false })
    expect(index.has('other')).toBe(false)
    expect(index.has(battery.uniqueId!)).toBe(false)
  })

  it('does not join a battery from another bridge with the same aid', () => {
    const sensor = hap({
      type: 'MotionSensor',
      aid: 2,
      bridge: 'BRIDGE-A',
      uniqueId: 'sensor',
    })
    const battery = batteryService({ aid: 2, bridge: 'BRIDGE-B', level: 50 })

    expect(buildBatteryIndex([sensor, battery]).has('sensor')).toBe(false)
  })

  it('attaches the battery to a sensor in preference to other services on the accessory', () => {
    const lightbulb = hap({ type: 'Lightbulb', aid: 4, uniqueId: 'lamp' })
    const sensor = hap({ type: 'TemperatureSensor', aid: 4, uniqueId: 'sensor' })
    const battery = batteryService({ aid: 4, level: 80 })

    const index = buildBatteryIndex([lightbulb, sensor, battery])

    expect(index.get('sensor')?.level).toBe(80)
    expect(index.has('lamp')).toBe(false)
  })

  it('uses the first non-battery service when no sensor is on the accessory', () => {
    const lightbulb = hap({ type: 'Lightbulb', aid: 5, uniqueId: 'lamp' })
    const battery = batteryService({ aid: 5, level: 60 })

    expect(buildBatteryIndex([lightbulb, battery]).get('lamp')?.level).toBe(60)
  })

  it('merges several HAP Battery services on one accessory to the lowest level', () => {
    const sensor = hap({ type: 'LeakSensor', aid: 6, uniqueId: 'sensor' })
    const first = batteryService({ aid: 6, level: 90, charging: true })
    const second = batteryService({ aid: 6, level: 40 })

    expect(buildBatteryIndex([sensor, first, second]).get('sensor')).toEqual({ level: 40, low: false, charging: true })
  })

  it('counts a StatusLowBattery value on the sensor own service', () => {
    const sensor = hap({
      type: 'ContactSensor',
      uniqueId: 'own',
      characteristics: [
        characteristic('ContactSensorState', 0),
        characteristic('StatusLowBattery', 1),
      ],
    })

    expect(buildBatteryIndex([sensor]).get('own')).toEqual({ level: undefined, low: true, charging: false })
  })

  it('reads BatteryLevel and ChargingState from the sensor own service', () => {
    const sensor = hap({
      type: 'HumiditySensor',
      uniqueId: 'own',
      characteristics: [
        characteristic('BatteryLevel', 55),
        characteristic('ChargingState', 1),
      ],
    })

    expect(buildBatteryIndex([sensor]).get('own')).toEqual({ level: 55, low: false, charging: true })
  })

  it('treats a battery level of 0 as low', () => {
    const sensor = hap({ type: 'MotionSensor', aid: 7, uniqueId: 'sensor' })

    expect(buildBatteryIndex([
      sensor,
      batteryService({ aid: 7, level: 0 }),
    ]).get('sensor')?.low).toBe(true)
  })

  it('leaves services without battery data out of the index', () => {
    expect(buildBatteryIndex([
      hap({ type: 'Lightbulb' }),
    ]).size).toBe(0)
  })

  it('reads the Matter Power Source cluster on the service itself', () => {
    const sensor = matter({
      deviceType: 'ContactSensor',
      uniqueId: 'matter-sensor',
      clusters: {
        powerSource: { batPercentRemaining: 130, batChargeLevel: 0, batChargeState: 3 },
      },
    })

    expect(buildBatteryIndex([sensor]).get('matter-sensor')).toEqual({ level: 65, low: false, charging: false })
  })

  it('marks Matter batteries low at warning or critical charge levels', () => {
    const warning = matter({
      deviceType: 'OccupancySensor',
      uniqueId: 'w',
      clusters: {
        powerSource: { batChargeLevel: 1 },
      },
    })
    const critical = matter({
      deviceType: 'OccupancySensor',
      uniqueId: 'c',
      clusters: {
        powerSource: { batChargeLevel: 2 },
      },
    })

    const index = buildBatteryIndex([warning, critical])

    expect(index.get('w')).toEqual({ level: undefined, low: true, charging: false })
    expect(index.get('c')?.low).toBe(true)
  })

  it('reads Matter charging state', () => {
    const device = matter({
      deviceType: 'TemperatureSensor',
      uniqueId: 'm',
      clusters: {
        powerSource: { batChargeState: 1 },
      },
    })

    expect(buildBatteryIndex([device]).get('m')?.charging).toBe(true)
  })

  it('ignores Matter services without a Power Source cluster', () => {
    expect(buildBatteryIndex([
      matter({ deviceType: 'OnOffLight', uniqueId: 'x' }),
    ]).size).toBe(0)
  })
})

describe('batteryBucket', () => {
  it('returns low first', () => {
    expect(batteryBucket({ level: 10, low: true, charging: true })).toBe('low')
    expect(batteryBucket({ low: true, charging: false })).toBe('low')
  })

  it('returns under20 below 20 percent', () => {
    expect(batteryBucket({ level: 19, low: false, charging: false })).toBe('under20')
  })

  it('returns charging when not low and at least 20 percent', () => {
    expect(batteryBucket({ level: 20, low: false, charging: true })).toBe('charging')
    expect(batteryBucket({ low: false, charging: true })).toBe('charging')
  })

  it('returns ok otherwise', () => {
    expect(batteryBucket({ level: 20, low: false, charging: false })).toBe('ok')
    expect(batteryBucket({ low: false, charging: false })).toBe('ok')
  })
})
