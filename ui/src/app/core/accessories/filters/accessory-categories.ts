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

  // Security and safety
  ['SecuritySystem', 'security'],
  ['LockMechanism', 'security'],
  ['DoorLock', 'security'],
  ['AccessCode', 'security'],
  ['Doorbell', 'security'],
  ['SmokeSensor', 'security'],
  ['SmokeCoAlarm', 'security'],
  ['CarbonMonoxideSensor', 'security'],
  ['LeakSensor', 'security'],
  ['WaterLeakDetector', 'security'],

  // Sensors
  ['MotionSensor', 'sensors'],
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

/**
 * The category of a service. Uses the user's customType when set (the type the
 * tile is shown as), then the device type. Unknown types fall back to 'other'.
 */
export function getAccessoryCategory(service: ServiceTypeX): AccessoryCategory {
  const matter = isMatterService(service)
  const candidates = matter
    ? [service.customType, service.deviceType, service.type]
    : [service.customType, service.type, service.deviceType]

  for (const key of candidates) {
    if (key && TYPE_CATEGORY.has(key)) {
      return TYPE_CATEGORY.get(key)!
    }
  }
  return 'other'
}
