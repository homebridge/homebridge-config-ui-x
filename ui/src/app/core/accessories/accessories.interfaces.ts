import type { ServiceType } from '@homebridge/hap-client'

export type AccessoryLayout = {
  name: string
  services: Array<{
    aid: number
    iid: number
    uuid: string
    uniqueId: string
    name: string
    serial: string
    bridge: string
    customName?: string
    customType?: string
    hidden?: boolean
    onDashboard?: boolean
  }>
}[]

/**
 * Matter OnOff cluster attributes
 */
export interface MatterOnOffCluster extends Record<string, unknown> {
  onOff: boolean
}

/**
 * Matter LevelControl cluster attributes
 */
export interface MatterLevelControlCluster extends Record<string, unknown> {
  currentLevel: number // 0-254 (brightness level)
  minLevel?: number // minimum level (default 0)
  maxLevel?: number // maximum level (default 254)
  remainingTime?: number // time remaining for transition
  onLevel?: number | null // level to use when turned on
  options?: number // behavior options
}

/**
 * Matter ColorControl cluster attributes
 */
export interface MatterColorControlCluster extends Record<string, unknown> {
  // Color temperature (mireds = 1,000,000 / kelvin)
  colorTemperatureMireds?: number
  colorTempPhysicalMinMireds?: number
  colorTempPhysicalMaxMireds?: number

  // Hue & Saturation (0-254 for hue, 0-254 for saturation)
  currentHue?: number
  currentSaturation?: number
  enhancedCurrentHue?: number // 0-65535 for enhanced precision

  // XY Color (CIE 1931 color space, 0-65535)
  currentX?: number
  currentY?: number

  // Color mode
  colorMode?: number // current color mode
  enhancedColorMode?: number // enhanced color mode

  // Options
  options?: number
}

/**
 * Matter rvcOperationalState cluster attributes
 */
export interface MatterRvcOperationalStateCluster extends Record<string, unknown> {
  phaseList?: string[] | null // list of operational phases
  currentPhase?: number | null // current phase index
  countdownTime?: number | null // remaining time for current operation
  operationalStateList?: Array<{
    operationalStateId: number
    operationalStateLabel?: string
  }>
  operationalState: number // 0=Stopped, 1=Running, 2=Paused, 3=Error, 64=SeekingCharger, 65=Charging, 66=Docked
  operationalError?: {
    errorStateId: number
    errorStateLabel?: string
    errorStateDetails?: string
  }
}

/**
 * Matter rvcRunMode cluster attributes
 */
export interface MatterRvcRunModeCluster extends Record<string, unknown> {
  supportedModes?: Array<{
    label: string
    mode: number
    modeTags?: Array<{ value: number }>
  }>
  currentMode: number // 0=Idle, 1=Cleaning
  startUpMode?: number | null // mode to use on startup
  onMode?: number | null // mode to use when turned on
}

/**
 * Matter rvcCleanMode cluster attributes
 */
export interface MatterRvcCleanModeCluster extends Record<string, unknown> {
  supportedModes?: Array<{
    label: string
    mode: number
    modeTags?: Array<{ value: number }>
  }>
  currentMode: number // current cleaning mode
  startUpMode?: number | null // mode to use on startup
  onMode?: number | null // mode to use when turned on
}

/**
 * Matter ServiceArea cluster attributes
 */
export interface MatterServiceAreaCluster extends Record<string, unknown> {
  supportedAreas?: Array<{
    areaId: number
    mapId: number | null
    areaInfo: {
      locationName?: string
      floorNumber?: number | null
      areaType?: number | null
    }
  }>
  supportedMaps?: Array<{
    mapId: number
    name: string
  }>
  selectedAreas?: number[]
  currentArea?: number | null
  estimatedEndTime?: number | null
  progress?: Array<{
    areaId: number
    status: number
    totalOperationalTime?: number | null
  }>
}

/**
 * Matter BooleanState cluster attributes
 * Used by: Contact Sensor, Water Leak Detector
 */
export interface MatterBooleanStateCluster extends Record<string, unknown> {
  stateValue: boolean
}

/**
 * Matter OccupancySensing cluster attributes
 */
export interface MatterOccupancySensingCluster extends Record<string, unknown> {
  occupancy: {
    occupied: boolean
  }
  occupancySensorType?: number // 0=PIR, 1=Ultrasonic, 2=Physical
  occupancySensorTypeBitmap?: unknown
}

/**
 * Matter IlluminanceMeasurement cluster attributes
 */
export interface MatterIlluminanceMeasurementCluster extends Record<string, unknown> {
  measuredValue: number | null // 0-65534, logarithmic lux scale
  minMeasuredValue?: number
  maxMeasuredValue?: number
}

/**
 * Matter TemperatureMeasurement cluster attributes
 */
export interface MatterTemperatureMeasurementCluster extends Record<string, unknown> {
  measuredValue: number | null // hundredths of °C
  minMeasuredValue?: number
  maxMeasuredValue?: number
}

/**
 * Matter RelativeHumidityMeasurement cluster attributes
 */
export interface MatterRelativeHumidityMeasurementCluster extends Record<string, unknown> {
  measuredValue: number | null // 0-10000, hundredths of a percent
  minMeasuredValue?: number
  maxMeasuredValue?: number
}

/**
 * Matter SmokeCoAlarm cluster attributes
 */
export interface MatterSmokeCoAlarmCluster extends Record<string, unknown> {
  smokeState: number // 0=Normal, 1=Warning, 2=Critical
  coState: number // 0=Normal, 1=Warning, 2=Critical
  batteryAlert?: number
  testInProgress?: boolean
  hardwareFaultAlert?: boolean
  endOfServiceAlert?: boolean
  interconnectSmokeAlarm?: number
  interconnectCOAlarm?: number
  contaminationState?: number
}

/**
 * Matter AirQuality cluster attributes
 */
export interface MatterAirQualityCluster extends Record<string, unknown> {
  airQuality: number // 0=Unknown, 1=Good, 2=Fair, 3=Moderate, 4=Poor, 5=VeryPoor, 6=ExtremelyPoor
}

/**
 * Matter PM2.5 ConcentrationMeasurement cluster attributes
 */
export interface MatterPM25ConcentrationMeasurementCluster extends Record<string, unknown> {
  measuredValue: number | null // µg/m³
  minMeasuredValue?: number
  maxMeasuredValue?: number
  measurementUnit?: number
  measurementMedium?: number
}

/**
 * Matter PM10 ConcentrationMeasurement cluster attributes
 */
export interface MatterPM10ConcentrationMeasurementCluster extends Record<string, unknown> {
  measuredValue: number | null // µg/m³
  minMeasuredValue?: number
  maxMeasuredValue?: number
  measurementUnit?: number
  measurementMedium?: number
}

/**
 * Matter DoorLock cluster attributes
 */
export interface MatterDoorLockCluster extends Record<string, unknown> {
  lockState: number | null // 0=NotFullyLocked, 1=Locked, 2=Unlocked, null=Unknown
  lockType?: number
  actuatorEnabled?: boolean
  operatingMode?: number
  doorState?: number | null // 0=DoorOpen, 1=DoorClosed, 2=DoorJammed, 3=DoorForcedOpen, 4=DoorUnspecifiedError, 5=DoorAjar
  doorOpenEvents?: number
  doorClosedEvents?: number
  openPeriod?: number
}

/**
 * Matter WindowCovering cluster attributes
 * Note: Matter uses inverted percentage - 0 = open, 10000 = closed
 */
export interface MatterWindowCoveringCluster extends Record<string, unknown> {
  // Type
  type?: number // WindowCoveringType

  // Config/Status
  configStatus?: {
    operational?: boolean
    online?: boolean
    liftMovementReversed?: boolean
    liftPositionAware?: boolean
    tiltPositionAware?: boolean
    liftEncoderControlled?: boolean
    tiltEncoderControlled?: boolean
  }

  // Lift positions (0-10000 where 0=open, 10000=closed)
  targetPositionLiftPercent100ths?: number | null
  currentPositionLiftPercent100ths?: number | null

  // Tilt positions (0-10000 where 0=open, 10000=closed)
  targetPositionTiltPercent100ths?: number | null
  currentPositionTiltPercent100ths?: number | null

  // Operational status
  operationalStatus?: number

  // Safety
  safetyStatus?: number

  // Mode
  mode?: number

  // Product type
  endProductType?: number
}

/**
 * Matter FanControl cluster attributes
 */
export interface MatterFanControlCluster extends Record<string, unknown> {
  fanMode: number // 0=Off, 1=Low, 2=Medium, 3=High, 4=On, 5=Auto, 6=Smart
  fanModeSequence?: number
  percentSetting: number | null // 0-100, null if not supported
  percentCurrent: number // 0-100
  speedMax?: number // maximum speed supported
  speedSetting?: number | null // current speed setting
  speedCurrent?: number // current actual speed
  rockSupport?: number // rocking/oscillation support bitmap
  rockSetting?: number // rocking/oscillation setting
  windSupport?: number // wind/natural mode support bitmap
  windSetting?: number // wind/natural mode setting
}

/**
 * Matter Thermostat cluster attributes
 * Note: Temperatures are in hundredths of °C (2500 = 25.00°C)
 */
export interface MatterThermostatCluster extends Record<string, unknown> {
  // Temperature measurements
  localTemperature: number | null // read-only, hundredths of °C, auto-populated from externalMeasuredIndoorTemperature or TemperatureMeasurement cluster
  externalMeasuredIndoorTemperature?: number | null // writable state for external temperature sensor (hundredths of °C)
  outdoorTemperature?: number | null

  // Occupancy (requires Occupancy feature)
  occupancy?: { occupied?: boolean } // occupancy state
  externallyMeasuredOccupancy?: boolean // alternative way to set occupancy via external sensor

  // Setpoint limits (absolute limits set by manufacturer)
  absMinHeatSetpointLimit?: number
  absMaxHeatSetpointLimit?: number
  absMinCoolSetpointLimit?: number
  absMaxCoolSetpointLimit?: number

  // Setpoints (hundredths of °C)
  occupiedHeatingSetpoint: number // heating setpoint when occupied
  occupiedCoolingSetpoint: number // cooling setpoint when occupied
  unoccupiedHeatingSetpoint?: number // heating setpoint when unoccupied (requires Occupancy feature)
  unoccupiedCoolingSetpoint?: number // cooling setpoint when unoccupied (requires Occupancy feature)

  // User-configurable setpoint limits
  minHeatSetpointLimit?: number
  maxHeatSetpointLimit?: number
  minCoolSetpointLimit?: number
  maxCoolSetpointLimit?: number

  // Auto mode configuration
  minSetpointDeadBand?: number // minimum temperature difference between heat/cool setpoints (required for AutoMode, in tenths of °C)

  // Control settings
  remoteSensing?: number
  controlSequenceOfOperation?: number // 0=CoolingOnly, 1=CoolingWithReheat, 2=HeatingOnly, 3=HeatingWithReheat, 4=CoolingAndHeating, 5=CoolingAndHeatingWithReheat
  systemMode: number // 0=Off, 1=Auto, 3=Cool, 4=Heat, 5=EmergencyHeat, 6=Precooling, 7=FanOnly
  thermostatRunningMode?: number // current running state

  // Schedule (if supported)
  startOfWeek?: number
  numberOfWeeklyTransitions?: number
  numberOfDailyTransitions?: number
}

/**
 * Known Matter cluster types
 */
export interface MatterClusters extends Record<string, unknown> {
  onOff?: MatterOnOffCluster
  levelControl?: MatterLevelControlCluster
  colorControl?: MatterColorControlCluster
  rvcOperationalState?: MatterRvcOperationalStateCluster
  rvcRunMode?: MatterRvcRunModeCluster
  rvcCleanMode?: MatterRvcCleanModeCluster
  serviceArea?: MatterServiceAreaCluster
  booleanState?: MatterBooleanStateCluster
  occupancySensing?: MatterOccupancySensingCluster
  illuminanceMeasurement?: MatterIlluminanceMeasurementCluster
  temperatureMeasurement?: MatterTemperatureMeasurementCluster
  relativeHumidityMeasurement?: MatterRelativeHumidityMeasurementCluster
  smokeCoAlarm?: MatterSmokeCoAlarmCluster
  airQuality?: MatterAirQualityCluster
  pm25ConcentrationMeasurement?: MatterPM25ConcentrationMeasurementCluster
  pm10ConcentrationMeasurement?: MatterPM10ConcentrationMeasurementCluster
  doorLock?: MatterDoorLockCluster
  windowCovering?: MatterWindowCoveringCluster
  fanControl?: MatterFanControlCluster
  thermostat?: MatterThermostatCluster
}

export type ServiceTypeX = ServiceType & {
  customName?: string
  customType?: string
  hidden?: boolean
  onDashboard?: boolean
  protocol?: 'matter'
  deviceType?: string
  displayName?: string
  clusters?: MatterClusters
  partId?: string
  bridge?: {
    name?: string
    username?: string
  }
  getCluster?: (clusterName: string) => {
    attributes: unknown
    setAttributes: (attributes: Record<string, unknown>) => Promise<void>
  } | null
}
