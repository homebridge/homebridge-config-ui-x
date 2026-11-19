import type { AccessoryCategory } from '@/app/core/accessories/filters/accessory-categories'

import { describe, expect, it } from 'vitest'

import { ACCESSORY_CATEGORIES, getAccessoryCategory } from '@/app/core/accessories/filters/accessory-categories'

import { hap, matter } from './accessory-filter.fixture'

describe('getAccessoryCategory', () => {
  const hapCases: Array<[string, AccessoryCategory]> = [
    ['Lightbulb', 'lights'],
    ['Switch', 'switches'],
    ['Outlet', 'switches'],
    ['StatelessProgrammableSwitch', 'switches'],
    ['Valve', 'switches'],
    ['IrrigationSystem', 'switches'],
    ['Thermostat', 'climate'],
    ['HeaterCooler', 'climate'],
    ['Heater', 'climate'],
    ['Cooler', 'climate'],
    ['HumidifierDehumidifier', 'climate'],
    ['Humidifier', 'climate'],
    ['Dehumidifier', 'climate'],
    ['Fan', 'climate'],
    ['Fanv2', 'climate'],
    ['AirPurifier', 'climate'],
    ['FilterMaintenance', 'climate'],
    ['WindowCovering', 'covers'],
    ['Window', 'covers'],
    ['Door', 'covers'],
    ['GarageDoorOpener', 'covers'],
    ['SecuritySystem', 'security'],
    ['LockMechanism', 'security'],
    ['AccessCode', 'security'],
    ['Doorbell', 'security'],
    ['SmokeSensor', 'security'],
    ['CarbonMonoxideSensor', 'security'],
    ['LeakSensor', 'security'],
    ['MotionSensor', 'sensors'],
    ['OccupancySensor', 'sensors'],
    ['ContactSensor', 'sensors'],
    ['LightSensor', 'sensors'],
    ['TemperatureSensor', 'sensors'],
    ['HumiditySensor', 'sensors'],
    ['AirQualitySensor', 'sensors'],
    ['CarbonDioxideSensor', 'sensors'],
    ['Battery', 'sensors'],
    ['Television', 'media'],
    ['Speaker', 'media'],
    ['SmartSpeaker', 'media'],
    ['Microphone', 'media'],
    ['RobotVacuum', 'other'],
    ['WashingMachine', 'other'],
  ]

  it.each(hapCases)('maps HAP type %s to %s', (type, category) => {
    expect(getAccessoryCategory(hap({ type }))).toBe(category)
  })

  const matterCases: Array<[string, AccessoryCategory]> = [
    ['OnOffLight', 'lights'],
    ['DimmableLight', 'lights'],
    ['ColorTemperatureLight', 'lights'],
    ['ExtendedColorLight', 'lights'],
    ['OnOffPlugInUnit', 'switches'],
    ['OnOffLightSwitch', 'switches'],
    ['GenericSwitch', 'switches'],
    ['WaterValve', 'switches'],
    ['Pump', 'switches'],
    ['Thermostat', 'climate'],
    ['Fan', 'climate'],
    ['RoomAirConditioner', 'climate'],
    ['WindowCovering', 'covers'],
    ['Door', 'covers'],
    ['Window', 'covers'],
    ['DoorLock', 'security'],
    ['SmokeCoAlarm', 'security'],
    ['WaterLeakDetector', 'security'],
    ['ContactSensor', 'sensors'],
    ['OccupancySensor', 'sensors'],
    ['LightSensor', 'sensors'],
    ['TemperatureSensor', 'sensors'],
    ['HumiditySensor', 'sensors'],
    ['AirQualitySensor', 'sensors'],
    ['RoboticVacuumCleaner', 'other'],
  ]

  it.each(matterCases)('maps Matter deviceType %s to %s', (deviceType, category) => {
    expect(getAccessoryCategory(matter({ deviceType }))).toBe(category)
  })

  it('uses customType over the default type', () => {
    expect(getAccessoryCategory(hap({ type: 'Switch', customType: 'Fan' }))).toBe('climate')
    expect(getAccessoryCategory(hap({ type: 'Lightbulb', customType: 'Outlet' }))).toBe('switches')
  })

  it('uses a Matter customType over the deviceType', () => {
    expect(getAccessoryCategory(matter({ deviceType: 'WindowCovering', customType: 'Door' }))).toBe('covers')
    expect(getAccessoryCategory(matter({ deviceType: 'OnOffLight', customType: 'OnOffPlugInUnit' }))).toBe('switches')
  })

  it('falls back to the type when customType is not a known type', () => {
    expect(getAccessoryCategory(hap({ type: 'Lightbulb', customType: 'Gadget' }))).toBe('lights')
  })

  it('returns other for unknown types and empty services', () => {
    expect(getAccessoryCategory(hap({ type: 'SomethingNew' }))).toBe('other')
    expect(getAccessoryCategory(matter({ deviceType: 'SomethingNew' }))).toBe('other')
    expect(getAccessoryCategory(hap({ type: '' }))).toBe('other')
  })

  it('does not treat inherited object keys as types', () => {
    expect(getAccessoryCategory(hap({ type: 'constructor' }))).toBe('other')
  })

  it('exports every category in display order', () => {
    expect(ACCESSORY_CATEGORIES).toEqual([
      'lights',
      'switches',
      'climate',
      'covers',
      'security',
      'sensors',
      'media',
      'other',
    ])
  })
})
