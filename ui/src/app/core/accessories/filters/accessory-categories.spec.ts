import type { AccessoryCategory } from '@/app/core/accessories/filters/accessory-categories'

import { describe, expect, it } from 'vitest'

import { ACCESSORY_CATEGORIES, ACCESSORY_SUBCATEGORIES, getAccessoryCategory, getAccessorySubcategory } from '@/app/core/accessories/filters/accessory-categories'
import { characteristic } from '@/testing'

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

describe('getAccessorySubcategory', () => {
  const hapCases: Array<[string, string]> = [
    ['OnOffLightSwitch', 'switch'],
    ['Switch', 'switch'],
    ['Pump', 'switch'],
    ['Outlet', 'outlet'],
    ['OnOffPlugInUnit', 'outlet'],
    ['Valve', 'valve'],
    ['WaterValve', 'valve'],
    ['IrrigationSystem', 'irrigation'],
    ['StatelessProgrammableSwitch', 'programmable'],
    ['GenericSwitch', 'programmable'],
    ['Thermostat', 'thermostat'],
    ['HeaterCooler', 'heatercooler'],
    ['Heater', 'heatercooler'],
    ['Cooler', 'heatercooler'],
    ['RoomAirConditioner', 'heatercooler'],
    ['Fan', 'fan'],
    ['Fanv2', 'fan'],
    ['AirPurifier', 'airpurifier'],
    ['HumidifierDehumidifier', 'humidifier'],
    ['Humidifier', 'humidifier'],
    ['Dehumidifier', 'humidifier'],
    ['FilterMaintenance', 'filter'],
    ['WindowCovering', 'windowcovering'],
    ['Window', 'window'],
    ['Door', 'door'],
    ['GarageDoorOpener', 'garagedoor'],
    ['SecuritySystem', 'securitysystem'],
    ['LockMechanism', 'lock'],
    ['DoorLock', 'lock'],
    ['AccessCode', 'lock'],
    ['Doorbell', 'doorbell'],
    ['SmokeSensor', 'smoke'],
    ['SmokeCoAlarm', 'smoke'],
    ['CarbonMonoxideSensor', 'carbonmonoxide'],
    ['LeakSensor', 'leak'],
    ['WaterLeakDetector', 'leak'],
    ['MotionSensor', 'motion'],
    ['OccupancySensor', 'occupancy'],
    ['ContactSensor', 'contact'],
    ['LightSensor', 'light'],
    ['TemperatureSensor', 'temperature'],
    ['HumiditySensor', 'humidity'],
    ['AirQualitySensor', 'airquality'],
    ['CarbonDioxideSensor', 'carbondioxide'],
    ['Battery', 'battery'],
    ['BatteryService', 'battery'],
    ['Television', 'television'],
    ['Speaker', 'speaker'],
    ['SmartSpeaker', 'speaker'],
    ['Microphone', 'microphone'],
    ['RobotVacuum', 'vacuum'],
    ['RoboticVacuumCleaner', 'vacuum'],
    ['WashingMachine', 'laundry'],
  ]

  it.each(hapCases)('maps HAP type %s to %s', (type, subcategory) => {
    expect(getAccessorySubcategory(hap({ type }))).toBe(subcategory)
  })

  const matterCases: Array<[string, string]> = [
    ['OnOffLight', 'onoff'],
    ['DimmableLight', 'dimmable'],
    ['ColorTemperatureLight', 'colortemp'],
    ['ExtendedColorLight', 'color'],
    ['OnOffPlugInUnit', 'outlet'],
    ['OnOffLightSwitch', 'switch'],
    ['GenericSwitch', 'programmable'],
    ['Thermostat', 'thermostat'],
    ['WindowCovering', 'windowcovering'],
    ['DoorLock', 'lock'],
    ['OccupancySensor', 'occupancy'],
    ['RoboticVacuumCleaner', 'vacuum'],
  ]

  it.each(matterCases)('maps Matter deviceType %s to %s', (deviceType, subcategory) => {
    expect(getAccessorySubcategory(matter({ deviceType }))).toBe(subcategory)
  })

  it('splits a HAP Lightbulb by its characteristics', () => {
    expect(getAccessorySubcategory(hap({ type: 'Lightbulb' }))).toBe('onoff')
    expect(getAccessorySubcategory(hap({
      type: 'Lightbulb',
      characteristics: [
        characteristic('Brightness', 50),
      ],
    }))).toBe('dimmable')
    expect(getAccessorySubcategory(hap({
      type: 'Lightbulb',
      characteristics: [
        characteristic('Brightness', 50),
        characteristic('ColorTemperature', 300),
      ],
    }))).toBe('colortemp')
    expect(getAccessorySubcategory(hap({
      type: 'Lightbulb',
      characteristics: [
        characteristic('Brightness', 50),
        characteristic('ColorTemperature', 300),
        characteristic('Hue', 10),
      ],
    }))).toBe('color')
    expect(getAccessorySubcategory(hap({
      type: 'Lightbulb',
      characteristics: [
        characteristic('Saturation', 10),
      ],
    }))).toBe('color')
  })

  it('reads lightbulb characteristics from the current values when the list is missing', () => {
    const service = hap({ type: 'Lightbulb' })
    service.serviceCharacteristics = []
    ;(service as any).values = { On: true, Brightness: 40 }
    expect(getAccessorySubcategory(service)).toBe('dimmable')
    ;(service as any).values = { On: true, Hue: 1 }
    expect(getAccessorySubcategory(service)).toBe('color')
  })

  it('uses the customType for the subcategory, as it does for the category', () => {
    expect(getAccessorySubcategory(hap({ type: 'Switch', customType: 'Fan' }))).toBe('fan')
    expect(getAccessorySubcategory(hap({ type: 'Lightbulb', customType: 'Outlet' }))).toBe('outlet')
  })

  it('falls back to other for unknown types', () => {
    expect(getAccessorySubcategory(hap({ type: 'SomethingNew' }))).toBe('other')
    expect(getAccessorySubcategory(matter({ deviceType: 'SomethingNew' }))).toBe('other')
    expect(getAccessorySubcategory(hap({ type: 'constructor' }))).toBe('other')
  })

  it('always returns a key listed under the service category', () => {
    const types = [
      'Lightbulb',
      'Switch',
      'Thermostat',
      'WindowCovering',
      'LockMechanism',
      'MotionSensor',
      'Television',
      'RobotVacuum',
      'SomethingNew',
    ]
    for (const type of types) {
      const service = hap({ type })
      expect(ACCESSORY_SUBCATEGORIES[getAccessoryCategory(service)]).toContain(getAccessorySubcategory(service))
    }
  })

  it('lists subcategories for every category', () => {
    for (const category of ACCESSORY_CATEGORIES) {
      expect(ACCESSORY_SUBCATEGORIES[category].length).toBeGreaterThan(0)
    }
  })
})
