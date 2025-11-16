import type { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

import { MatterBrightness, MatterDeviceType, RvcOperationalState, RvcRunMode } from './matter-device.constants'

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
 * Check if RVC is active (running or paused)
 */
export function isRvcActive(service: ServiceTypeX): boolean {
  const state = getRvcOperationalState(service)
  return state === RvcOperationalState.Running || state === RvcOperationalState.Paused
}

/**
 * Control an RVC device by toggling its state (run/pause/resume)
 */
export function controlRvcDevice(service: ServiceTypeX): void {
  const currentState = getRvcOperationalState(service)

  if (currentState === RvcOperationalState.Running) {
    // Running → Pause
    const cluster = service.getCluster?.('rvcOperationalState')
    if (cluster) {
      cluster.setAttributes({ operationalState: RvcOperationalState.Paused }).catch((error) => {
        console.error('Failed to pause Matter robotic vacuum:', error)
      })
    }
  } else if (currentState === RvcOperationalState.Paused) {
    // Paused → Resume
    const cluster = service.getCluster?.('rvcOperationalState')
    if (cluster) {
      cluster.setAttributes({ operationalState: RvcOperationalState.Running }).catch((error) => {
        console.error('Failed to resume Matter robotic vacuum:', error)
      })
    }
  } else {
    // Stopped/Docked/Charging → Start cleaning via RvcRunMode
    const runModeCluster = service.getCluster?.('rvcRunMode')
    if (runModeCluster) {
      runModeCluster.setAttributes({ currentMode: RvcRunMode.Cleaning }).catch((error) => {
        console.error('Failed to start Matter robotic vacuum:', error)
      })
    } else {
      console.error('RvcRunMode cluster not found')
    }
  }
}

/**
 * Control an OnOff device by toggling its state
 */
export function controlOnOffDevice(service: ServiceTypeX): void {
  const currentState = service.clusters?.onOff?.onOff ?? false
  const newState = !currentState

  const cluster = service.getCluster?.('onOff')
  if (cluster) {
    cluster.setAttributes({ onOff: newState }).catch((error) => {
      console.error('Failed to control Matter device:', error)
    })
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
    controlRvcDevice(service)
  } else {
    controlOnOffDevice(service)
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
      return 'Seeking Charger'
    case RvcOperationalState.Charging:
      return 'Charging'
    case RvcOperationalState.Docked:
      return 'Docked'
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
 * Convert a percentage (0-100) to brightness level (0-254)
 */
export function percentageToLevel(percentage: number): number {
  return Math.round((percentage / 100) * MatterBrightness.Max)
}

/**
 * Toggle a dimmable light on/off
 */
export function toggleDimmableLight(service: ServiceTypeX): void {
  const brightness = getBrightnessLevel(service)
  const isOn = getOnOffState(service)

  if (isOn) {
    // Turn off - use onOff cluster instead of levelControl
    // Setting level to 0 may be clamped to minLevel (usually 1), keeping light on
    const onOffCluster = service.getCluster?.('onOff')
    if (onOffCluster) {
      onOffCluster.setAttributes({ onOff: false }).catch((error) => {
        console.error('Failed to turn Matter light off:', error)
      })
    }
  } else {
    // Turn on - set to max if currently 0, otherwise restore previous level
    const targetLevel = brightness || MatterBrightness.Max
    const levelCluster = service.getCluster?.('levelControl')
    if (levelCluster) {
      levelCluster.setAttributes({ currentLevel: targetLevel }).catch((error) => {
        console.error('Failed to turn Matter light on:', error)
      })
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
 * Check if a device supports hue/saturation color control
 */
export function hasHueSaturation(service: ServiceTypeX): boolean {
  const cluster = service.clusters?.colorControl
  return cluster?.currentHue !== undefined || cluster?.currentSaturation !== undefined
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

/**
 * Get PM2.5 concentration value (µg/m³)
 */
export function getPM25Value(service: ServiceTypeX): number | null {
  return service.clusters?.pm25ConcentrationMeasurement?.measuredValue ?? null
}

/**
 * Get PM10 concentration value (µg/m³)
 */
export function getPM10Value(service: ServiceTypeX): number | null {
  return service.clusters?.pm10ConcentrationMeasurement?.measuredValue ?? null
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
 * Check if door lock is locked
 */
export function isDoorLocked(service: ServiceTypeX): boolean {
  return getDoorLockState(service) === 1
}

/**
 * Toggle door lock state
 */
export function toggleDoorLock(service: ServiceTypeX): void {
  const currentState = getDoorLockState(service)
  const cluster = service.getCluster?.('doorLock')

  if (!cluster) {
    console.error('Door lock cluster not found')
    return
  }

  if (currentState === 1) {
    // Currently locked → unlock
    cluster.setAttributes({ lockState: 2 }).catch((error) => {
      console.error('Failed to unlock door:', error)
    })
  } else {
    // Currently unlocked or not fully locked → lock
    cluster.setAttributes({ lockState: 1 }).catch((error) => {
      console.error('Failed to lock door:', error)
    })
  }
}

/**
 * Set door lock state directly
 */
export function setDoorLockState(service: ServiceTypeX, locked: boolean): void {
  const cluster = service.getCluster?.('doorLock')

  if (!cluster) {
    console.error('Door lock cluster not found')
    return
  }

  const targetState = locked ? 1 : 2
  cluster.setAttributes({ lockState: targetState }).catch((error) => {
    console.error('Failed to set door lock state:', error)
  })
}

// ============================================================================
// Window Covering Utility Functions
// ============================================================================

/**
 * Get current window covering position (0-10000, where 0=open, 10000=closed)
 * Matter uses inverted percentage
 */
export function getWindowCoveringPosition(service: ServiceTypeX): number {
  return service.clusters?.windowCovering?.currentPositionLiftPercent100ths ?? 0
}

/**
 * Get target window covering position (0-10000, where 0=open, 10000=closed)
 */
export function getWindowCoveringTargetPosition(service: ServiceTypeX): number {
  return service.clusters?.windowCovering?.targetPositionLiftPercent100ths ?? 0
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
export function setWindowCoveringPosition(service: ServiceTypeX, percentage: number): void {
  const cluster = service.getCluster?.('windowCovering')

  if (!cluster) {
    console.error('Window covering cluster not found')
    return
  }

  const matterPosition = percentageToMatterPosition(percentage)
  cluster.setAttributes({ targetPositionLiftPercent100ths: matterPosition }).catch((error) => {
    console.error('Failed to set window covering position:', error)
  })
}

/**
 * Toggle window covering (open if closed, close if open)
 */
export function toggleWindowCovering(service: ServiceTypeX): void {
  const currentPercentage = getWindowCoveringPercentage(service)

  // If more than 50% open, close it; otherwise open it
  if (currentPercentage > 50) {
    setWindowCoveringPosition(service, 0) // Close
  } else {
    setWindowCoveringPosition(service, 100) // Open
  }
}

/**
 * Check if window covering is open (more than 0%)
 */
export function isWindowCoveringOpen(service: ServiceTypeX): boolean {
  return getWindowCoveringPercentage(service) > 0
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
 * Get current fan speed percentage (0-100)
 */
export function getFanPercentCurrent(service: ServiceTypeX): number {
  return service.clusters?.fanControl?.percentCurrent ?? 0
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
export function toggleFan(service: ServiceTypeX): void {
  const isOn = isFanOn(service)
  const cluster = service.getCluster?.('fanControl')

  if (!cluster) {
    console.error('Fan control cluster not found')
    return
  }

  if (isOn) {
    // Turn off
    cluster.setAttributes({ percentSetting: 0 }).catch((error) => {
      console.error('Failed to turn fan off:', error)
    })
  } else {
    // Turn on to 100%
    cluster.setAttributes({ percentSetting: 100 }).catch((error) => {
      console.error('Failed to turn fan on:', error)
    })
  }
}

/**
 * Set fan speed percentage (0-100)
 */
export function setFanSpeed(service: ServiceTypeX, percent: number): void {
  const cluster = service.getCluster?.('fanControl')

  if (!cluster) {
    console.error('Fan control cluster not found')
    return
  }

  cluster.setAttributes({ percentSetting: percent }).catch((error) => {
    console.error('Failed to set fan speed:', error)
  })
}

// ============================================================================
// Thermostat Utility Functions
// ============================================================================

/**
 * Get current temperature in °C
 * Matter stores temperature in hundredths of °C
 */
export function getThermostatLocalTemperature(service: ServiceTypeX): number | null {
  const temp = service.clusters?.thermostat?.externalMeasuredIndoorTemperature
  if (temp === null || temp === undefined) {
    return null
  }
  return temp / 100
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
export function setThermostatSystemMode(service: ServiceTypeX, mode: number): void {
  const cluster = service.getCluster?.('thermostat')

  if (!cluster) {
    console.error('Thermostat cluster not found')
    return
  }

  cluster.setAttributes({ systemMode: mode }).catch((error) => {
    console.error('Failed to set thermostat system mode:', error)
  })
}

/**
 * Set heating setpoint
 * @param service - The service
 * @param temperatureCelsius - Temperature in °C
 */
export function setThermostatHeatingSetpoint(service: ServiceTypeX, temperatureCelsius: number): void {
  const cluster = service.getCluster?.('thermostat')

  if (!cluster) {
    console.error('Thermostat cluster not found')
    return
  }

  const setpoint = Math.round(temperatureCelsius * 100)
  cluster.setAttributes({ occupiedHeatingSetpoint: setpoint }).catch((error) => {
    console.error('Failed to set heating setpoint:', error)
  })
}

/**
 * Set cooling setpoint
 * @param service - The service
 * @param temperatureCelsius - Temperature in °C
 */
export function setThermostatCoolingSetpoint(service: ServiceTypeX, temperatureCelsius: number): void {
  const cluster = service.getCluster?.('thermostat')

  if (!cluster) {
    console.error('Thermostat cluster not found')
    return
  }

  const setpoint = Math.round(temperatureCelsius * 100)
  cluster.setAttributes({ occupiedCoolingSetpoint: setpoint }).catch((error) => {
    console.error('Failed to set cooling setpoint:', error)
  })
}
