/**
 * Matter device type constants
 */
export const MatterDeviceType = {
  OnOffLight: 'OnOffLight',
  OnOffLightSwitch: 'OnOffLightSwitch',
  OnOffPlugInUnit: 'OnOffPlugInUnit',
  DimmableLight: 'DimmableLight',
  ColorTemperatureLight: 'ColorTemperatureLight',
  ExtendedColorLight: 'ExtendedColorLight',
  RoboticVacuumCleaner: 'RoboticVacuumCleaner',
  ContactSensor: 'ContactSensor',
  OccupancySensor: 'OccupancySensor',
  LightSensor: 'LightSensor',
  TemperatureSensor: 'TemperatureSensor',
  HumiditySensor: 'HumiditySensor',
  SmokeCoAlarm: 'SmokeCoAlarm',
  WaterLeakDetector: 'WaterLeakDetector',
  AirQualitySensor: 'AirQualitySensor',
  DoorLock: 'DoorLock',
  WindowCovering: 'WindowCovering',
  Door: 'Door', // custom type (use WindowCovering cluster but with different icons)
  Window: 'Window', // custom type (use WindowCovering cluster but with different icons)
  Fan: 'Fan',
  Thermostat: 'Thermostat',
} as const

/**
 * RVC Operational States
 */
export enum RvcOperationalState {
  Stopped = 0,
  Running = 1,
  Paused = 2,
  Error = 3,
  SeekingCharger = 64,
  Charging = 65,
  Docked = 66,
}

/**
 * RVC Run Mode values
 */
export enum RvcRunMode {
  Idle = 0,
  Cleaning = 1,
}

/**
 * Matter brightness range constants
 */
export const MatterBrightness = {
  Min: 0,
  Max: 254,
} as const

/**
 * Matter color temperature range constants (in mireds)
 * 147 mireds = ~6800K (cool white)
 * 500 mireds = ~2000K (warm white)
 */
export const MatterColorTemperature = {
  MinMired: 147, // ~6800K
  MaxMired: 500, // ~2000K
} as const

/**
 * Door Lock States
 */
export enum DoorLockState {
  NotFullyLocked = 0,
  Locked = 1,
  Unlocked = 2,
}

/**
 * Matter window covering position range constants
 * Note: Matter uses inverted percentage - 0 = open, 10000 = closed
 */
export const MatterWindowCovering = {
  FullyOpen: 0,
  FullyClosed: 10000,
} as const

/**
 * Thermostat System Modes
 */
export enum ThermostatSystemMode {
  Off = 0,
  Auto = 1,
  Cool = 3,
  Heat = 4,
  EmergencyHeat = 5,
  Precooling = 6,
  FanOnly = 7,
}

/**
 * Fan Modes
 */
export enum FanMode {
  Off = 0,
  Low = 1,
  Medium = 2,
  High = 3,
  On = 4,
  Auto = 5,
  Smart = 6,
}
