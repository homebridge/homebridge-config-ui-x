import type { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

import { MatterBrightness, MatterDeviceType, RvcOperationalState, RvcRunMode, WaterValveState } from './matter-device.constants'

// ============================================================================
// Cluster Features
// ============================================================================

/**
 * The features a cluster was registered with, as named booleans.
 *
 * Matter gates parts of a cluster behind features chosen at registration, and a
 * plugin can now pick those itself (`api.matter.deviceRequirements`). The UI has
 * to respect that, or it offers controls the device will reject: a thermostat
 * without AutoMode is the obvious one, but the same applies to a covering with
 * no Tilt, or a colour light with no HueSaturation.
 *
 * Homebridge sends the map from v2.4.0; callers pass an `inferred` fallback for
 * older versions, worked out from the declared attributes.
 *
 * ⚠️ `undefined` from here means "not known", NOT "no features" - never treat a
 * missing map as everything being off, or every control disappears on an older
 * Homebridge.
 *
 * Deliberately NOT behind a `featureFlags` entry. The flag would only tell us
 * whether the map SHOULD be there, and the answer changes nothing: with no map
 * we fall back to inference either way. Inference is also exactly right on
 * older versions - they had no `deviceRequirements`, so every cluster's
 * features were auto-detected from the very attributes we read here.
 */
export function getClusterFeatures(service: ServiceTypeX, cluster: string): Record<string, boolean> | undefined {
  const featureMap = (service.clusters?.[cluster] as { featureMap?: unknown } | undefined)?.featureMap
  if (!featureMap || typeof featureMap !== 'object') {
    return undefined
  }
  return featureMap as Record<string, boolean>
}

/**
 * Resolve one cluster feature to a boolean, falling back to an inferred value
 * when the running Homebridge does not send the feature map.
 */
export function hasClusterFeature(
  service: ServiceTypeX,
  cluster: string,
  feature: string,
  inferred: boolean,
): boolean {
  const features = getClusterFeatures(service, cluster)
  return features ? features[feature] === true : inferred
}

/**
 * Check if a device is an OnOff type (light, switch, or plug-in unit)
 */
export function isOnOffDevice(service: ServiceTypeX): boolean {
  return service.deviceType === MatterDeviceType.OnOffLight
    || service.deviceType === MatterDeviceType.OnOffLightSwitch
    || service.deviceType === MatterDeviceType.OnOffPlugInUnit
}

/**
 * Check if a device is a Robotic Vacuum Cleaner
 */
export function isRvcDevice(service: ServiceTypeX): boolean {
  return service.deviceType === MatterDeviceType.RoboticVacuumCleaner
}

/**
 * Get the current RVC operational state
 */
export function getRvcOperationalState(service: ServiceTypeX): RvcOperationalState {
  return (service.clusters?.rvcOperationalState?.operationalState ?? RvcOperationalState.Stopped) as RvcOperationalState
}

/**
 * Check if RVC is active (running, paused, or seeking charger)
 */
export function isRvcActive(service: ServiceTypeX): boolean {
  const state = getRvcOperationalState(service)
  return state === RvcOperationalState.Running || state === RvcOperationalState.Paused || state === RvcOperationalState.SeekingCharger
}

/**
 * Control an RVC device by toggling its state (run/pause/resume)
 */
export async function controlRvcDevice(service: ServiceTypeX): Promise<void> {
  const currentState = getRvcOperationalState(service)

  if (currentState === RvcOperationalState.Running) {
    // Running → Pause
    const cluster = service.getCluster?.('rvcOperationalState')
    if (!cluster) {
      const error = new Error('RVC operational state cluster not found')
      console.error(error.message)
      throw error
    }
    try {
      await cluster.setAttributes({ operationalState: RvcOperationalState.Paused })
    } catch (error) {
      console.error('Failed to pause Matter robotic vacuum:', error)
      throw error
    }
  } else if (currentState === RvcOperationalState.Paused) {
    // Paused → Resume
    const cluster = service.getCluster?.('rvcOperationalState')
    if (!cluster) {
      const error = new Error('RVC operational state cluster not found')
      console.error(error.message)
      throw error
    }
    try {
      await cluster.setAttributes({ operationalState: RvcOperationalState.Running })
    } catch (error) {
      console.error('Failed to resume Matter robotic vacuum:', error)
      throw error
    }
  } else {
    // Stopped/Docked/Charging → Start cleaning via RvcRunMode
    const runModeCluster = service.getCluster?.('rvcRunMode')
    if (!runModeCluster) {
      const error = new Error('RvcRunMode cluster not found')
      console.error(error.message)
      throw error
    }
    try {
      await runModeCluster.setAttributes({ currentMode: RvcRunMode.Cleaning })
    } catch (error) {
      console.error('Failed to start Matter robotic vacuum:', error)
      throw error
    }
  }
}

/**
 * Control an OnOff device by toggling its state
 */
export async function controlOnOffDevice(service: ServiceTypeX): Promise<void> {
  const currentState = service.clusters?.onOff?.onOff ?? false
  const newState = !currentState

  const cluster = service.getCluster?.('onOff')
  if (!cluster) {
    const error = new Error('OnOff cluster not found')
    console.error(error.message)
    throw error
  }

  try {
    await cluster.setAttributes({ onOff: newState })
  } catch (error) {
    console.error('Failed to control Matter device:', error)
    throw error
  }
}

/**
 * Get the OnOff state of a device
 */
export function getOnOffState(service: ServiceTypeX): boolean {
  return service.clusters?.onOff?.onOff ?? false
}

/**
 * Check if a device has level control (dimmable lights)
 */
function hasLevelControl(service: ServiceTypeX): boolean {
  return service.clusters?.levelControl !== undefined
}

/**
 * Get the active state for any cross-compatible device
 * (handles OnOff, dimmable lights, and RVC devices)
 */
export function getDeviceActiveState(service: ServiceTypeX): boolean {
  if (isRvcDevice(service)) {
    return isRvcActive(service)
  }

  // For dimmable lights, check BOTH onOff state AND brightness level
  // - When turned off via Home app: onOff=false, level stays at previous value
  // - When turned off via UI (level=0): onOff may not update immediately, but level=0
  // We need to check both to handle all cases correctly
  if (hasLevelControl(service)) {
    const isOn = getOnOffState(service)
    const hasLevel = getBrightnessLevel(service) > 0
    return isOn && hasLevel
  }

  return getOnOffState(service)
}

/**
 * Control any cross-compatible device
 * (handles both OnOff and RVC devices based on the actual deviceType)
 */
export function controlDevice(service: ServiceTypeX): void {
  if (isRvcDevice(service)) {
    void controlRvcDevice(service)
  } else {
    void controlOnOffDevice(service)
  }
}

/**
 * Get status text for RVC device
 */
export function getRvcStatusText(service: ServiceTypeX): string {
  const state = getRvcOperationalState(service)

  switch (state) {
    case RvcOperationalState.Running:
      return 'accessories.control.cleaning'
    case RvcOperationalState.Paused:
      return 'accessories.control.paused'
    case RvcOperationalState.SeekingCharger:
      return 'accessories.control.seeking_charger'
    case RvcOperationalState.Charging:
      return 'accessories.control.charging'
    case RvcOperationalState.Docked:
      return 'accessories.control.docked'
    case RvcOperationalState.Stopped:
    default:
      return 'accessories.control.stopped'
  }
}

/**
 * Get status text for OnOff device
 */
export function getOnOffStatusText(service: ServiceTypeX): string {
  const isOn = getOnOffState(service)
  return isOn ? 'accessories.control.on' : 'accessories.control.off'
}

/**
 * Get status text for any cross-compatible device
 */
export function getDeviceStatusText(service: ServiceTypeX): string {
  if (isRvcDevice(service)) {
    return getRvcStatusText(service)
  }
  return getOnOffStatusText(service)
}

/**
 * Get the current brightness level (0-254)
 */
export function getBrightnessLevel(service: ServiceTypeX): number {
  return service.clusters?.levelControl?.currentLevel ?? MatterBrightness.Min
}

/**
 * Get the brightness as a percentage (0-100)
 */
export function getBrightnessPercentage(service: ServiceTypeX): number {
  const level = getBrightnessLevel(service)
  return Math.round((level / MatterBrightness.Max) * 100)
}

/**
 * Convert a brightness level (0-254) to percentage (0-100)
 */
export function levelToPercentage(level: number): number {
  return Math.round((level / MatterBrightness.Max) * 100)
}

/**
 * Toggle a dimmable light on/off
 */
export async function toggleDimmableLight(service: ServiceTypeX): Promise<void> {
  const brightness = getBrightnessLevel(service)
  const isOn = getOnOffState(service)

  if (isOn) {
    // Turn off - use onOff cluster instead of levelControl
    // Setting level to 0 may be clamped to minLevel (usually 1), keeping light on
    const onOffCluster = service.getCluster?.('onOff')
    if (!onOffCluster) {
      const error = new Error('OnOff cluster not found')
      console.error(error.message)
      throw error
    }
    try {
      await onOffCluster.setAttributes({ onOff: false })
    } catch (error) {
      console.error('Failed to turn Matter light off:', error)
      throw error
    }
  } else {
    // Turn on - set to max if currently 0, otherwise restore previous level
    const targetLevel = brightness || MatterBrightness.Max
    const levelCluster = service.getCluster?.('levelControl')
    const onOffCluster = service.getCluster?.('onOff')
    if (!levelCluster || !onOffCluster) {
      const error = new Error(!levelCluster ? 'LevelControl cluster not found' : 'OnOff cluster not found')
      console.error(error.message)
      throw error
    }
    try {
      // A raw currentLevel attribute write does not run Matter's on/off
      // coupling (that only happens for the moveToLevelWithOnOff command,
      // which real controllers send), so onOff must be written as well or
      // the device state never reads as on
      await levelCluster.setAttributes({ currentLevel: targetLevel })
      await onOffCluster.setAttributes({ onOff: true })
    } catch (error) {
      console.error('Failed to turn Matter light on:', error)
      throw error
    }
  }
}

/**
 * Get the current color temperature in mireds
 */
export function getColorTemperatureMireds(service: ServiceTypeX): number {
  return service.clusters?.colorControl?.colorTemperatureMireds ?? 250
}

/**
 * Check if a device supports color temperature control
 */
export function hasColorTemperature(service: ServiceTypeX): boolean {
  return service.clusters?.colorControl?.colorTemperatureMireds !== undefined
}

/**
 * Get the current color mode
 * 0 = Hue/Saturation, 1 = Enhanced Hue/Saturation (XY), 2 = Color Temperature
 */
export function getColorMode(service: ServiceTypeX): number {
  return service.clusters?.colorControl?.colorMode ?? 0
}

/**
 * Get the current hue value (0-254)
 */
export function getHue(service: ServiceTypeX): number {
  return service.clusters?.colorControl?.currentHue ?? 0
}

/**
 * Get the current saturation value (0-254)
 */
export function getSaturation(service: ServiceTypeX): number {
  return service.clusters?.colorControl?.currentSaturation ?? 0
}

// ============================================================================
// Sensor Utility Functions
// ============================================================================

/**
 * Get contact sensor state (Matter BooleanState cluster)
 * Note: Matter uses inverted logic - true=closed/normal, false=open/triggered
 * We invert it here to match HAP logic (true=open)
 */
export function getContactSensorState(service: ServiceTypeX): boolean {
  const stateValue = service.clusters?.booleanState?.stateValue ?? false
  return !stateValue // Invert: false (open) becomes true, true (closed) becomes false
}

/**
 * Get occupancy sensor state
 */
export function getOccupancySensorState(service: ServiceTypeX): boolean {
  return service.clusters?.occupancySensing?.occupancy?.occupied ?? false
}

/**
 * Get light sensor illuminance value (in lux)
 * Matter uses logarithmic scale: lux = 10^((measuredValue - 1) / 10000)
 */
export function getLightSensorIlluminance(service: ServiceTypeX): number {
  const measuredValue = service.clusters?.illuminanceMeasurement?.measuredValue ?? 0
  if (measuredValue === 0 || measuredValue === null) {
    return 0
  }
  // Convert from logarithmic scale to lux
  return 10 ** ((measuredValue - 1) / 10000)
}

/**
 * Get the active power reading (in watts)
 * Matter stores ElectricalPowerMeasurement.activePower in milliwatts
 */
export function getActivePowerWatts(service: ServiceTypeX): number | null {
  const activePower = service.clusters?.electricalPowerMeasurement?.activePower
  if (activePower === null || activePower === undefined || typeof activePower !== 'number') {
    return null
  }
  return activePower / 1000 // Convert from milliwatts to watts
}

/**
 * Get temperature sensor value (in °C)
 * Matter stores temperature in hundredths of °C
 */
export function getTemperatureSensorValue(service: ServiceTypeX): number | null {
  const measuredValue = service.clusters?.temperatureMeasurement?.measuredValue
  if (measuredValue === null || measuredValue === undefined) {
    return null
  }
  return measuredValue / 100 // Convert from hundredths to degrees
}

/**
 * Get humidity sensor value (as percentage 0-100)
 * Matter stores humidity in hundredths of a percent (0-10000)
 */
export function getHumiditySensorValue(service: ServiceTypeX): number | null {
  const measuredValue = service.clusters?.relativeHumidityMeasurement?.measuredValue
  if (measuredValue === null || measuredValue === undefined) {
    return null
  }
  return measuredValue / 100 // Convert from hundredths to percentage
}

/**
 * Get smoke alarm state
 * 0 = Normal, 1 = Warning, 2 = Critical
 */
export function getSmokeAlarmState(service: ServiceTypeX): number {
  return service.clusters?.smokeCoAlarm?.smokeState ?? 0
}

/**
 * Get CO alarm state
 * 0 = Normal, 1 = Warning, 2 = Critical
 */
export function getCoAlarmState(service: ServiceTypeX): number {
  return service.clusters?.smokeCoAlarm?.coState ?? 0
}

/**
 * Whether this alarm senses smoke.
 *
 * A plugin can now register a SmokeCoAlarm with only one of the two alarms, so
 * a device sitting under the "SmokeSensor" device type may in fact be a
 * carbon monoxide alarm and nothing else.
 */
export function hasSmokeAlarm(service: ServiceTypeX): boolean {
  return hasClusterFeature(
    service,
    'smokeCoAlarm',
    'smokeAlarm',
    service.clusters?.smokeCoAlarm?.smokeState !== undefined,
  )
}

/**
 * Whether this alarm senses carbon monoxide.
 */
export function hasCoAlarm(service: ServiceTypeX): boolean {
  return hasClusterFeature(
    service,
    'smokeCoAlarm',
    'coAlarm',
    service.clusters?.smokeCoAlarm?.coState !== undefined,
  )
}

/**
 * Check if smoke or CO alarm is triggered (warning or critical)
 */
export function isSmokeCoAlarmTriggered(service: ServiceTypeX): boolean {
  const smokeState = getSmokeAlarmState(service)
  const coState = getCoAlarmState(service)
  return smokeState > 0 || coState > 0
}

/**
 * Get water leak detector state
 * Matter BooleanState: false = dry/normal, true = leak detected
 */
export function getWaterLeakState(service: ServiceTypeX): boolean {
  return service.clusters?.booleanState?.stateValue ?? false
}

/**
 * Get air quality value
 * 0 = Unknown, 1 = Good, 2 = Fair, 3 = Moderate, 4 = Poor, 5 = VeryPoor, 6 = ExtremelyPoor
 */
export function getAirQualityValue(service: ServiceTypeX): number {
  return service.clusters?.airQuality?.airQuality ?? 0
}

// ============================================================================
// Door Lock Utility Functions
// ============================================================================

/**
 * Get door lock state
 * 0 = Not Fully Locked, 1 = Locked, 2 = Unlocked
 */
export function getDoorLockState(service: ServiceTypeX): number {
  return service.clusters?.doorLock?.lockState ?? 1
}

/**
 * Toggle door lock state
 */
export async function toggleDoorLock(service: ServiceTypeX): Promise<void> {
  const currentState = getDoorLockState(service)
  const cluster = service.getCluster?.('doorLock')

  if (!cluster) {
    const error = new Error('Door lock cluster not found')
    console.error(error.message)
    throw error
  }

  try {
    if (currentState === 1) {
      // Currently locked → unlock
      await cluster.setAttributes({ lockState: 2 })
    } else {
      // Currently unlocked or not fully locked → lock
      await cluster.setAttributes({ lockState: 1 })
    }
  } catch (error) {
    console.error(`Failed to ${currentState === 1 ? 'unlock' : 'lock'} door:`, error)
    throw error
  }
}

/**
 * Set door lock state directly
 */
export async function setDoorLockState(service: ServiceTypeX, locked: boolean): Promise<void> {
  const cluster = service.getCluster?.('doorLock')

  if (!cluster) {
    const error = new Error('Door lock cluster not found')
    console.error(error.message)
    throw error
  }

  const targetState = locked ? 1 : 2
  try {
    await cluster.setAttributes({ lockState: targetState })
  } catch (error) {
    console.error('Failed to set door lock state:', error)
    throw error
  }
}

// ============================================================================
// Window Covering Utility Functions
// ============================================================================

/**
 * Whether this covering can be moved up and down.
 *
 * A tilt-only blind has no lift at all, so offering a position slider would
 * write an attribute the cluster does not have. Inferred from the declared
 * attributes on Homebridge versions that do not send the feature map - which is
 * exactly what those versions detected the features from themselves.
 */
export function hasWindowCoveringLift(service: ServiceTypeX): boolean {
  const cluster = service.clusters?.windowCovering
  return hasClusterFeature(
    service,
    'windowCovering',
    'positionAwareLift',
    cluster?.currentPositionLiftPercent100ths !== undefined
    || cluster?.targetPositionLiftPercent100ths !== undefined,
  )
}

/**
 * Whether this covering has tilting slats, as a Venetian blind does.
 */
export function hasWindowCoveringTilt(service: ServiceTypeX): boolean {
  const cluster = service.clusters?.windowCovering
  return hasClusterFeature(
    service,
    'windowCovering',
    'positionAwareTilt',
    cluster?.currentPositionTiltPercent100ths !== undefined
    || cluster?.targetPositionTiltPercent100ths !== undefined,
  )
}

/**
 * Get current window covering position (0-10000, where 0=open, 10000=closed)
 * Matter uses inverted percentage
 */
export function getWindowCoveringPosition(service: ServiceTypeX): number {
  return service.clusters?.windowCovering?.currentPositionLiftPercent100ths ?? 0
}

/**
 * Get current tilt position (0-10000, where 0=open, 10000=closed)
 */
export function getWindowCoveringTiltPosition(service: ServiceTypeX): number {
  return service.clusters?.windowCovering?.currentPositionTiltPercent100ths ?? 0
}

/**
 * Convert Matter position (0=open, 10000=closed) to percentage (0-100)
 */
export function matterPositionToPercentage(position: number): number {
  // Matter: 0=open, 10000=closed
  // Percentage: 0=closed, 100=open
  return Math.round(100 - (position / 100))
}

/**
 * Convert percentage (0-100) to Matter position (0=open, 10000=closed)
 */
export function percentageToMatterPosition(percentage: number): number {
  // Percentage: 0=closed, 100=open
  // Matter: 0=open, 10000=closed
  return Math.round((100 - percentage) * 100)
}

/**
 * Get window covering position as percentage (0-100, where 0=closed, 100=open)
 */
export function getWindowCoveringPercentage(service: ServiceTypeX): number {
  const position = getWindowCoveringPosition(service)
  return matterPositionToPercentage(position)
}

/**
 * Set window covering position
 * @param service - The service
 * @param percentage - Percentage open (0=closed, 100=open)
 */
export async function setWindowCoveringPosition(service: ServiceTypeX, percentage: number): Promise<void> {
  const cluster = service.getCluster?.('windowCovering')

  if (!cluster) {
    const error = new Error('Window covering cluster not found')
    console.error(error.message)
    throw error
  }

  const matterPosition = percentageToMatterPosition(percentage)
  try {
    await cluster.setAttributes({ targetPositionLiftPercent100ths: matterPosition })
  } catch (error) {
    console.error('Failed to set window covering position:', error)
    throw error
  }
}

/**
 * Get tilt position as percentage (0-100, where 0=closed, 100=open)
 */
export function getWindowCoveringTiltPercentage(service: ServiceTypeX): number {
  return matterPositionToPercentage(getWindowCoveringTiltPosition(service))
}

/**
 * Set window covering tilt position
 * @param service - The service
 * @param percentage - Percentage open (0=closed, 100=open)
 */
export async function setWindowCoveringTiltPosition(service: ServiceTypeX, percentage: number): Promise<void> {
  const cluster = service.getCluster?.('windowCovering')

  if (!cluster) {
    const error = new Error('Window covering cluster not found')
    console.error(error.message)
    throw error
  }

  const matterPosition = percentageToMatterPosition(percentage)
  try {
    await cluster.setAttributes({ targetPositionTiltPercent100ths: matterPosition })
  } catch (error) {
    console.error('Failed to set window covering tilt position:', error)
    throw error
  }
}

/**
 * How open this covering is, as a percentage, for the tile and the modal's
 * summary line.
 *
 * ⚠️ Reads the TILT position on a covering that only tilts. Its lift position
 * would otherwise default to 0, which reads as fully open.
 */
export function getWindowCoveringOpenPercentage(service: ServiceTypeX): number {
  return hasWindowCoveringLift(service)
    ? getWindowCoveringPercentage(service)
    : getWindowCoveringTiltPercentage(service)
}

/**
 * Toggle window covering (open if closed, close if open)
 *
 * Drives the tilt on a covering that only tilts - writing a lift position it
 * has no feature for is rejected.
 */
export async function toggleWindowCovering(service: ServiceTypeX): Promise<void> {
  const tiltOnly = !hasWindowCoveringLift(service) && hasWindowCoveringTilt(service)
  const currentPercentage = getWindowCoveringOpenPercentage(service)
  const setPosition = tiltOnly ? setWindowCoveringTiltPosition : setWindowCoveringPosition

  // If more than 50% open, close it; otherwise open it
  if (currentPercentage > 50) {
    await setPosition(service, 0) // Close
  } else {
    await setPosition(service, 100) // Open
  }
}

// ============================================================================
// Water Valve Utility Functions
// ============================================================================

/**
 * Get water valve state
 * 0 = Closed, 1 = Open, 2 = Transitioning
 */
export function getWaterValveState(service: ServiceTypeX): number {
  return service.clusters?.valveConfigurationAndControl?.currentState ?? WaterValveState.Closed
}

/**
 * Check if the water valve is open (or moving towards open)
 */
export function isWaterValveOpen(service: ServiceTypeX): boolean {
  const state = getWaterValveState(service)
  return state === WaterValveState.Open
    || (state === WaterValveState.Transitioning
      && service.clusters?.valveConfigurationAndControl?.targetState === WaterValveState.Open)
}

/**
 * Toggle water valve open/closed
 * Setting targetState maps to the valve's open/close command in Homebridge,
 * so plugin handlers are invoked.
 */
export async function toggleWaterValve(service: ServiceTypeX): Promise<void> {
  const cluster = service.getCluster?.('valveConfigurationAndControl')

  if (!cluster) {
    const error = new Error('ValveConfigurationAndControl cluster not found')
    console.error(error.message)
    throw error
  }

  const targetState = isWaterValveOpen(service) ? WaterValveState.Closed : WaterValveState.Open
  try {
    await cluster.setAttributes({ targetState })
  } catch (error) {
    console.error(`Failed to ${targetState === WaterValveState.Open ? 'open' : 'close'} water valve:`, error)
    throw error
  }
}

// ============================================================================
// Fan Utility Functions
// ============================================================================

/**
 * Get fan mode
 * 0=Off, 1=Low, 2=Medium, 3=High, 4=On, 5=Auto, 6=Smart
 */
export function getFanMode(service: ServiceTypeX): number {
  return service.clusters?.fanControl?.fanMode ?? 0
}

/**
 * Get fan speed percentage (0-100)
 */
export function getFanPercentSetting(service: ServiceTypeX): number {
  return service.clusters?.fanControl?.percentSetting ?? 0
}

/**
 * Check if fan is on (mode > 0 or percent > 0)
 */
export function isFanOn(service: ServiceTypeX): boolean {
  const mode = getFanMode(service)
  const percent = getFanPercentSetting(service)
  return mode > 0 || percent > 0
}

/**
 * Toggle fan on/off
 */
export async function toggleFan(service: ServiceTypeX): Promise<void> {
  const isOn = isFanOn(service)
  const cluster = service.getCluster?.('fanControl')

  if (!cluster) {
    const error = new Error('Fan control cluster not found')
    console.error(error.message)
    throw error
  }

  try {
    if (isOn) {
      // Turn off
      await cluster.setAttributes({ percentSetting: 0 })
    } else {
      // Turn on to 100%
      await cluster.setAttributes({ percentSetting: 100 })
    }
  } catch (error) {
    console.error(`Failed to turn fan ${isOn ? 'off' : 'on'}:`, error)
    throw error
  }
}

/**
 * Set fan speed percentage (0-100)
 */
export async function setFanSpeed(service: ServiceTypeX, percent: number): Promise<void> {
  const cluster = service.getCluster?.('fanControl')

  if (!cluster) {
    const error = new Error('Fan control cluster not found')
    console.error(error.message)
    throw error
  }

  try {
    await cluster.setAttributes({ percentSetting: percent })
  } catch (error) {
    console.error('Failed to set fan speed:', error)
    throw error
  }
}

// ============================================================================
// Thermostat Utility Functions
// ============================================================================

/**
 * Get current temperature in °C
 * Matter stores temperature in hundredths of °C
 */
export function getThermostatLocalTemperature(service: ServiceTypeX): number | null {
  const temp = service.clusters?.thermostat?.localTemperature
    ?? service.clusters?.thermostat?.externalMeasuredIndoorTemperature
  if (temp === null || temp === undefined) {
    return null
  }
  return temp / 100
}

/**
 * Which modes this thermostat supports, for deciding which controls to offer.
 *
 * The feature map is authoritative - it is the only thing that can tell a
 * heat+cool thermostat WITH auto mode from one without, since both declare the
 * same setpoints. Without it, infer exactly as Homebridge itself did: a
 * declared heating setpoint meant Heating, cooling likewise, and both together
 * always meant AutoMode too.
 */
export function getThermostatSupportedModes(service: ServiceTypeX): { heat: boolean, cool: boolean, auto: boolean } {
  const cluster = service.clusters?.thermostat
  const declaredHeat = cluster?.occupiedHeatingSetpoint !== undefined
  const declaredCool = cluster?.occupiedCoolingSetpoint !== undefined

  // Nothing declared and no map: offer everything rather than an empty modal
  const noInfo = !declaredHeat && !declaredCool && !getClusterFeatures(service, 'thermostat')

  return {
    heat: noInfo || hasClusterFeature(service, 'thermostat', 'heating', declaredHeat),
    cool: noInfo || hasClusterFeature(service, 'thermostat', 'cooling', declaredCool),
    auto: noInfo || hasClusterFeature(service, 'thermostat', 'autoMode', declaredHeat && declaredCool),
  }
}

/**
 * Get system mode
 * 0=Off, 1=Auto, 3=Cool, 4=Heat, 5=Emergency Heat, 6=Precooling, 7=Fan Only
 */
export function getThermostatSystemMode(service: ServiceTypeX): number {
  return service.clusters?.thermostat?.systemMode ?? 0
}

/**
 * Get heating setpoint in °C
 */
export function getThermostatHeatingSetpoint(service: ServiceTypeX): number {
  const setpoint = service.clusters?.thermostat?.occupiedHeatingSetpoint ?? 2000
  return setpoint / 100
}

/**
 * Get cooling setpoint in °C
 */
export function getThermostatCoolingSetpoint(service: ServiceTypeX): number {
  const setpoint = service.clusters?.thermostat?.occupiedCoolingSetpoint ?? 2400
  return setpoint / 100
}

/**
 * Check if thermostat is on (system mode > 0)
 */
export function isThermostatOn(service: ServiceTypeX): boolean {
  return getThermostatSystemMode(service) > 0
}

/**
 * Set thermostat system mode
 */
export async function setThermostatSystemMode(service: ServiceTypeX, mode: number): Promise<void> {
  const cluster = service.getCluster?.('thermostat')

  if (!cluster) {
    const error = new Error('Thermostat cluster not found')
    console.error(error.message)
    throw error
  }

  try {
    await cluster.setAttributes({ systemMode: mode })
  } catch (error) {
    console.error('Failed to set thermostat system mode:', error)
    throw error
  }
}

/**
 * Set heating setpoint
 * @param service - The service
 * @param temperatureCelsius - Temperature in °C
 */
export async function setThermostatHeatingSetpoint(service: ServiceTypeX, temperatureCelsius: number): Promise<void> {
  const cluster = service.getCluster?.('thermostat')

  if (!cluster) {
    const error = new Error('Thermostat cluster not found')
    console.error(error.message)
    throw error
  }

  const setpoint = Math.round(temperatureCelsius * 100)
  try {
    await cluster.setAttributes({ occupiedHeatingSetpoint: setpoint })
  } catch (error) {
    console.error('Failed to set heating setpoint:', error)
    throw error
  }
}

/**
 * Set cooling setpoint
 * @param service - The service
 * @param temperatureCelsius - Temperature in °C
 */
export async function setThermostatCoolingSetpoint(service: ServiceTypeX, temperatureCelsius: number): Promise<void> {
  const cluster = service.getCluster?.('thermostat')

  if (!cluster) {
    const error = new Error('Thermostat cluster not found')
    console.error(error.message)
    throw error
  }

  const setpoint = Math.round(temperatureCelsius * 100)
  try {
    await cluster.setAttributes({ occupiedCoolingSetpoint: setpoint })
  } catch (error) {
    console.error('Failed to set cooling setpoint:', error)
    throw error
  }
}

// ============================================================================
// Air Quality Concentration Utility Functions
// ============================================================================

/**
 * Get PM2.5 concentration value (µg/m³)
 */
export function getPm25Value(service: ServiceTypeX): number | null {
  return service.clusters?.pm25ConcentrationMeasurement?.measuredValue ?? null
}

/**
 * Get PM10 concentration value (µg/m³)
 */
export function getPm10Value(service: ServiceTypeX): number | null {
  return service.clusters?.pm10ConcentrationMeasurement?.measuredValue ?? null
}

/**
 * Get Carbon Monoxide concentration value (ppm)
 */
export function getCarbonMonoxideValue(service: ServiceTypeX): number | null {
  return service.clusters?.carbonMonoxideConcentrationMeasurement?.measuredValue ?? null
}

/**
 * Get Nitrogen Dioxide concentration value (ppb)
 */
export function getNitrogenDioxideValue(service: ServiceTypeX): number | null {
  return service.clusters?.nitrogenDioxideConcentrationMeasurement?.measuredValue ?? null
}

/**
 * Get Ozone concentration value (ppb)
 */
export function getOzoneValue(service: ServiceTypeX): number | null {
  return service.clusters?.ozoneConcentrationMeasurement?.measuredValue ?? null
}

/**
 * Check if any concentration data is available
 */
export function hasConcentrationData(service: ServiceTypeX): boolean {
  return getPm25Value(service) !== null
    || getPm10Value(service) !== null
    || getCarbonMonoxideValue(service) !== null
    || getNitrogenDioxideValue(service) !== null
    || getOzoneValue(service) !== null
}

type ConcentrationClusterName
  = | 'pm25ConcentrationMeasurement'
    | 'pm10ConcentrationMeasurement'
    | 'carbonMonoxideConcentrationMeasurement'
    | 'nitrogenDioxideConcentrationMeasurement'
    | 'ozoneConcentrationMeasurement'

/**
 * Get the unit for a concentration cluster
 * measurementUnit: 0 = PPM, 1 = PPB, 2 = PPT, 3 = mg/m³, 4 = µg/m³
 */
export function getConcentrationUnit(service: ServiceTypeX, clusterName: ConcentrationClusterName): string {
  const cluster = service.clusters?.[clusterName]
  if (cluster?.measurementUnit !== undefined) {
    switch (cluster.measurementUnit) {
      case 0: return 'ppm'
      case 1: return 'ppb'
      case 2: return 'ppt'
      case 3: return 'mg/m³'
      case 4: return 'µg/m³'
    }
  }
  // Defaults based on cluster type
  if (clusterName.includes('pm25') || clusterName.includes('pm10')) {
    return 'µg/m³'
  }
  if (clusterName.includes('carbonMonoxide')) {
    return 'ppm'
  }
  return 'ppb' // NO2 and Ozone
}

// ============================================================================
// RVC Service Area & Clean Mode Utility Functions
// ============================================================================

/**
 * Check if the device has a ServiceArea cluster
 */
export function hasServiceAreaCluster(service: ServiceTypeX): boolean {
  return !!service.clusters?.serviceArea
}

/**
 * Check if the device has an RvcCleanMode cluster
 */
export function hasCleanModeCluster(service: ServiceTypeX): boolean {
  return !!service.clusters?.rvcCleanMode
}

/**
 * Get service areas with names
 */
export function getServiceAreas(service: ServiceTypeX): Array<{ areaId: number, name: string }> {
  const areas = service.clusters?.serviceArea?.supportedAreas
  if (!Array.isArray(areas)) {
    return []
  }
  return areas.map(area => ({
    areaId: area.areaId,
    name: area.areaInfo?.locationName || `Area ${area.areaId}`,
  }))
}

/**
 * Get the selected area IDs
 */
export function getSelectedAreas(service: ServiceTypeX): number[] {
  return service.clusters?.serviceArea?.selectedAreas ?? []
}

/**
 * Get the current area being serviced
 */
export function getCurrentArea(service: ServiceTypeX): number | null {
  return service.clusters?.serviceArea?.currentArea ?? null
}

/**
 * Get area progress information
 */
export function getAreaProgress(service: ServiceTypeX): Array<{ areaId: number, status: number }> {
  return service.clusters?.serviceArea?.progress ?? []
}

/**
 * Get supported clean modes
 */
export function getCleanModes(service: ServiceTypeX): Array<{ label: string, mode: number }> {
  return service.clusters?.rvcCleanMode?.supportedModes ?? []
}

/**
 * Get the current clean mode
 */
export function getCurrentCleanMode(service: ServiceTypeX): number {
  return service.clusters?.rvcCleanMode?.currentMode ?? 0
}
