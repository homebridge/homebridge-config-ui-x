import type { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

import { isMatterService } from './service-helpers'

export type AccessoryCategory = 'lights' | 'switches' | 'climate' | 'covers' | 'security' | 'sensors' | 'media' | 'other'

/** Display and grouping order of the categories */
export const ACCESSORY_CATEGORIES: readonly AccessoryCategory[] = [
  'lights',
  'switches',
  'climate',
  'covers',
  'security',
  'sensors',
  'media',
  'other',
]

/**
 * Tile type keys (HAP `type` or `customType`, Matter `deviceType` or `customType`)
 * mapped to a category. Keys match the tile switch in accessory-tile.component.html.
 */
const TYPE_CATEGORY = new Map<string, AccessoryCategory>([
  // Lights
  ['Lightbulb', 'lights'],
  ['OnOffLight', 'lights'],
  ['DimmableLight', 'lights'],
  ['ColorTemperatureLight', 'lights'],
  ['ExtendedColorLight', 'lights'],

  // Switches and outlets (including valves, pumps and buttons)
  ['Switch', 'switches'],
  ['Outlet', 'switches'],
  ['OnOffPlugInUnit', 'switches'],
  ['OnOffLightSwitch', 'switches'],
  ['StatelessProgrammableSwitch', 'switches'],
  ['GenericSwitch', 'switches'],
  ['Valve', 'switches'],
  ['WaterValve', 'switches'],
  ['IrrigationSystem', 'switches'],
  ['Pump', 'switches'],

  // Climate
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
  ['RoomAirConditioner', 'climate'],

  // Covers, doors and windows
  ['WindowCovering', 'covers'],
  ['Window', 'covers'],
  ['Door', 'covers'],
  ['GarageDoorOpener', 'covers'],

  // Security
  ['SecuritySystem', 'security'],
  ['LockMechanism', 'security'],
  ['DoorLock', 'security'],
  ['AccessCode', 'security'],
  ['Doorbell', 'security'],

  // Sensors, including smoke, carbon monoxide and leak detectors
  ['MotionSensor', 'sensors'],
  ['SmokeSensor', 'sensors'],
  ['SmokeCoAlarm', 'sensors'],
  ['CarbonMonoxideSensor', 'sensors'],
  ['LeakSensor', 'sensors'],
  ['WaterLeakDetector', 'sensors'],
  ['OccupancySensor', 'sensors'],
  ['ContactSensor', 'sensors'],
  ['LightSensor', 'sensors'],
  ['TemperatureSensor', 'sensors'],
  ['HumiditySensor', 'sensors'],
  ['AirQualitySensor', 'sensors'],
  ['CarbonDioxideSensor', 'sensors'],
  ['Battery', 'sensors'],
  ['BatteryService', 'sensors'],

  // Media and audio
  ['Television', 'media'],
  ['Speaker', 'media'],
  ['SmartSpeaker', 'media'],
  ['Microphone', 'media'],

  // Everything else
  ['RobotVacuum', 'other'],
  ['RoboticVacuumCleaner', 'other'],
  ['WashingMachine', 'other'],
])

/** Subcategory keys under each category, in display order. Keys are translated as accessories.subcategories.<key>. */
export const ACCESSORY_SUBCATEGORIES: Record<AccessoryCategory, readonly string[]> = {
  lights: [
    'onoff',
    'dimmable',
    'colortemp',
    'color',
  ],
  switches: [
    'switch',
    'outlet',
    'valve',
    'irrigation',
    'programmable',
  ],
  climate: [
    'thermostat',
    'heatercooler',
    'fan',
    'airpurifier',
    'humidifier',
    'filter',
  ],
  covers: [
    'windowcovering',
    'door',
    'window',
    'garagedoor',
  ],
  security: [
    'lock',
    'securitysystem',
    'doorbell',
  ],
  sensors: [
    'motion',
    'occupancy',
    'contact',
    'temperature',
    'humidity',
    'light',
    'airquality',
    'smoke',
    'carbonmonoxide',
    'carbondioxide',
    'leak',
    'battery',
  ],
  media: ['television', 'speaker', 'microphone'],
  other: ['vacuum', 'laundry', 'other'],
}

/** Subcategory of each tile type key. Lightbulb is split by its characteristics, see getAccessorySubcategory. */
const TYPE_SUBCATEGORY = new Map<string, string>([
  ['OnOffLight', 'onoff'],
  ['DimmableLight', 'dimmable'],
  ['ColorTemperatureLight', 'colortemp'],
  ['ExtendedColorLight', 'color'],

  ['Switch', 'switch'],
  ['OnOffLightSwitch', 'switch'],
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
])

/** The tile type key a service is classified by: the first candidate with a known category, or undefined */
function matchedTypeKey(service: ServiceTypeX): string | undefined {
  const matter = isMatterService(service)
  const candidates = matter
    ? [service.customType, service.deviceType, service.type]
    : [service.customType, service.type, service.deviceType]

  return candidates.find(key => !!key && TYPE_CATEGORY.has(key))
}

/**
 * The category of a service. Uses the user's customType when set (the type the
 * tile is shown as), then the device type. Unknown types fall back to 'other'.
 */
export function getAccessoryCategory(service: ServiceTypeX): AccessoryCategory {
  const key = matchedTypeKey(service)
  return key
    ? TYPE_CATEGORY.get(key)!
    : 'other'
}

/** True when the service has the named characteristic, in its HAP characteristics or current values */
function hasCharacteristic(service: ServiceTypeX, name: string): boolean {
  const values = service.values as Record<string, unknown> | undefined
  return (service.serviceCharacteristics ?? []).some(c => c.type === name) || (values !== undefined && name in values)
}

/**
 * The subcategory key of a service, always one of ACCESSORY_SUBCATEGORIES for its category.
 * A HAP Lightbulb is colour when it has Hue or Saturation, colour temperature when it has
 * ColorTemperature, dimmable when it has Brightness, otherwise on/off.
 */
export function getAccessorySubcategory(service: ServiceTypeX): string {
  const key = matchedTypeKey(service)
  if (!key) {
    return 'other'
  }
  if (key === 'Lightbulb') {
    if (hasCharacteristic(service, 'Hue') || hasCharacteristic(service, 'Saturation')) {
      return 'color'
    }
    if (hasCharacteristic(service, 'ColorTemperature')) {
      return 'colortemp'
    }
    return hasCharacteristic(service, 'Brightness')
      ? 'dimmable'
      : 'onoff'
  }
  return TYPE_SUBCATEGORY.get(key) ?? 'other'
}
