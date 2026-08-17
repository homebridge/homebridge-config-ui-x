import type { MatterServiceFixture } from '@/testing'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RvcOperationalState, RvcRunMode, WaterValveState } from '@/app/core/accessories/types/matter/matter-device.constants'
import {
  controlOnOffDevice,
  controlRvcDevice,
  getActivePowerWatts,
  getAirQualityValue,
  getAreaProgress,
  getBrightnessLevel,
  getBrightnessPercentage,
  getCarbonMonoxideValue,
  getCleanModes,
  getCoAlarmState,
  getColorMode,
  getColorTemperatureMireds,
  getConcentrationUnit,
  getContactSensorState,
  getCurrentArea,
  getCurrentCleanMode,
  getDeviceActiveState,
  getDeviceStatusText,
  getDoorLockState,
  getFanMode,
  getFanPercentSetting,
  getHue,
  getHumiditySensorValue,
  getLightSensorIlluminance,
  getNitrogenDioxideValue,
  getOccupancySensorState,
  getOnOffState,
  getOzoneValue,
  getPm10Value,
  getPm25Value,
  getRvcOperationalState,
  getSaturation,
  getSelectedAreas,
  getServiceAreas,
  getSmokeAlarmState,
  getTemperatureSensorValue,
  getThermostatCoolingSetpoint,
  getThermostatHeatingSetpoint,
  getThermostatLocalTemperature,
  getThermostatSupportedModes,
  getThermostatSystemMode,
  getWaterLeakState,
  getWaterValveState,
  getWindowCoveringOpenPercentage,
  getWindowCoveringPercentage,
  getWindowCoveringTiltPercentage,
  hasCleanModeCluster,
  hasClusterFeature,
  hasCoAlarm,
  hasColorTemperature,
  hasConcentrationData,
  hasServiceAreaCluster,
  hasSmokeAlarm,
  hasWindowCoveringLift,
  hasWindowCoveringTilt,
  isFanOn,
  isOnOffDevice,
  isRvcActive,
  isRvcDevice,
  isSmokeCoAlarmTriggered,
  isThermostatOn,
  isWaterValveOpen,
  levelToPercentage,
  matterPositionToPercentage,
  percentageToMatterPosition,
  setDoorLockState,
  setFanSpeed,
  setThermostatCoolingSetpoint,
  setThermostatHeatingSetpoint,
  setThermostatSystemMode,
  setWindowCoveringPosition,
  setWindowCoveringTiltPosition,
  toggleDimmableLight,
  toggleDoorLock,
  toggleFan,
  toggleWaterValve,
  toggleWindowCovering,
} from '@/app/core/accessories/types/matter/matter-device.utils'
import { matterService } from '@/testing'

/**
 * Build a Matter accessory with exactly the clusters given. Passing `{}` is the
 * "device does not have this cluster" case, which is half of what these
 * functions have to get right.
 * @param clusters - the cluster attribute maps
 * @param deviceType - the Matter device type
 */
function device(clusters: Record<string, Record<string, unknown>> = {}, deviceType?: string) {
  return matterService({ clusters, deviceType })
}

describe('matter-device.utils', () => {
  beforeEach(() => {
    // The mutators log before rethrowing; the throw is what is asserted
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('cluster features', () => {
    it('reads a feature the running homebridge declared', () => {
      const service = device({ thermostat: { featureMap: { heating: true, cooling: false } } })

      expect(hasClusterFeature(service, 'thermostat', 'heating', false)).toBe(true)
      expect(hasClusterFeature(service, 'thermostat', 'cooling', true)).toBe(false)
    })

    it('treats a key missing from a present map as off, not as unknown', () => {
      const service = device({ thermostat: { featureMap: { heating: true } } })

      expect(hasClusterFeature(service, 'thermostat', 'autoMode', true)).toBe(false)
    })

    it('falls back to the inferred value when there is no map at all', () => {
      const service = device({ thermostat: {} })

      expect(hasClusterFeature(service, 'thermostat', 'autoMode', true)).toBe(true)
      expect(hasClusterFeature(service, 'thermostat', 'autoMode', false)).toBe(false)
    })

    it('falls back to the inferred value when the cluster is absent', () => {
      expect(hasClusterFeature(device(), 'thermostat', 'heating', true)).toBe(true)
    })

    it('ignores a feature map that is not an object', () => {
      const service = device({ thermostat: { featureMap: 'heating' } })

      expect(hasClusterFeature(service, 'thermostat', 'heating', true)).toBe(true)
    })
  })

  describe('device type predicates', () => {
    it.each([
      ['OnOffLight', true],
      ['OnOffLightSwitch', true],
      ['OnOffPlugInUnit', true],
      ['DimmableLight', false],
      ['RoboticVacuumCleaner', false],
    ])('treats %s as an on/off device: %s', (deviceType, expected) => {
      expect(isOnOffDevice(device({}, deviceType))).toBe(expected)
    })

    it('recognises a robotic vacuum', () => {
      expect(isRvcDevice(device({}, 'RoboticVacuumCleaner'))).toBe(true)
      expect(isRvcDevice(device({}, 'OnOffLight'))).toBe(false)
    })
  })

  describe('on/off and brightness', () => {
    it('defaults to off when the cluster is missing', () => {
      expect(getOnOffState(device())).toBe(false)
      expect(getOnOffState(device({ onOff: { onOff: true } }))).toBe(true)
    })

    it.each([
      [0, 0],
      [1, 0],
      [127, 50],
      [254, 100],
    ])('converts level %i to %i%%', (level, expected) => {
      expect(levelToPercentage(level)).toBe(expected)
      expect(getBrightnessPercentage(device({ levelControl: { currentLevel: level } }))).toBe(expected)
    })

    it('reads brightness as zero when there is no level control', () => {
      expect(getBrightnessLevel(device())).toBe(0)
    })

    it('needs both on and a non-zero level before a dimmable light counts as active', () => {
      const on = { onOff: { onOff: true } }

      expect(getDeviceActiveState(device({ ...on, levelControl: { currentLevel: 100 } }))).toBe(true)
      expect(getDeviceActiveState(device({ ...on, levelControl: { currentLevel: 0 } }))).toBe(false)
      expect(getDeviceActiveState(device({ onOff: { onOff: false }, levelControl: { currentLevel: 100 } }))).toBe(false)
    })

    it('uses on/off alone when there is no level control', () => {
      expect(getDeviceActiveState(device({ onOff: { onOff: true } }))).toBe(true)
    })

    it('reads a vacuum through its operational state, not its on/off cluster', () => {
      const service = device({
        onOff: { onOff: false },
        rvcOperationalState: { operationalState: RvcOperationalState.Running },
      }, 'RoboticVacuumCleaner')

      expect(getDeviceActiveState(service)).toBe(true)
    })

    it('writes the inverted state to the onOff cluster', async () => {
      const service = device({ onOff: { onOff: false } })

      await controlOnOffDevice(service)

      expect(service.writes).toEqual([{ cluster: 'onOff', attributes: { onOff: true } }])
    })

    it('throws when the onOff cluster is missing', async () => {
      await expect(controlOnOffDevice(device())).rejects.toThrow('OnOff cluster not found')
    })

    it('rethrows a failed write', async () => {
      const service = device({ onOff: { onOff: false } })
      service.failWrites('onOff', new Error('write rejected'))

      await expect(controlOnOffDevice(service)).rejects.toThrow('write rejected')
    })

    it('turns a dimmable light off through onOff, not by writing level zero', async () => {
      const service = device({ onOff: { onOff: true }, levelControl: { currentLevel: 200 } })

      await toggleDimmableLight(service)

      expect(service.writes).toEqual([{ cluster: 'onOff', attributes: { onOff: false } }])
    })

    it('turns a dimmable light back on at its previous level', async () => {
      const service = device({ onOff: { onOff: false }, levelControl: { currentLevel: 200 } })

      await toggleDimmableLight(service)

      expect(service.writes).toEqual([{ cluster: 'levelControl', attributes: { currentLevel: 200 } }])
    })

    it('turns a light stored at level zero on at full brightness', async () => {
      const service = device({ onOff: { onOff: false }, levelControl: { currentLevel: 0 } })

      await toggleDimmableLight(service)

      expect(service.writes).toEqual([{ cluster: 'levelControl', attributes: { currentLevel: 254 } }])
    })
  })

  describe('colour', () => {
    it('defaults the colour temperature to 250 mireds', () => {
      expect(getColorTemperatureMireds(device())).toBe(250)
      expect(getColorTemperatureMireds(device({ colorControl: { colorTemperatureMireds: 370 } }))).toBe(370)
    })

    it('reports colour temperature support from the attribute being present', () => {
      expect(hasColorTemperature(device({ colorControl: {} }))).toBe(false)
      expect(hasColorTemperature(device({ colorControl: { colorTemperatureMireds: 250 } }))).toBe(true)
    })

    it('defaults hue, saturation and mode to zero', () => {
      expect(getColorMode(device())).toBe(0)
      expect(getHue(device())).toBe(0)
      expect(getSaturation(device())).toBe(0)
    })
  })

  describe('robotic vacuum', () => {
    it('defaults to stopped', () => {
      expect(getRvcOperationalState(device())).toBe(RvcOperationalState.Stopped)
    })

    it.each([
      [RvcOperationalState.Running, true],
      [RvcOperationalState.Paused, true],
      [RvcOperationalState.SeekingCharger, true],
      [RvcOperationalState.Stopped, false],
      [RvcOperationalState.Charging, false],
      [RvcOperationalState.Docked, false],
      [RvcOperationalState.Error, false],
    ])('treats operational state %i as active: %s', (state, expected) => {
      expect(isRvcActive(device({ rvcOperationalState: { operationalState: state } }))).toBe(expected)
    })

    it.each([
      [RvcOperationalState.Running, 'accessories.control.cleaning'],
      [RvcOperationalState.Paused, 'accessories.control.paused'],
      [RvcOperationalState.SeekingCharger, 'accessories.control.seeking_charger'],
      [RvcOperationalState.Charging, 'accessories.control.charging'],
      [RvcOperationalState.Docked, 'accessories.control.docked'],
      [RvcOperationalState.Stopped, 'accessories.control.stopped'],
      [RvcOperationalState.Error, 'accessories.control.stopped'],
    ])('labels operational state %i as %s', (state, expected) => {
      const service = device({ rvcOperationalState: { operationalState: state } }, 'RoboticVacuumCleaner')

      expect(getDeviceStatusText(service)).toBe(expected)
    })

    it('labels a plain on/off device by its power state', () => {
      expect(getDeviceStatusText(device({ onOff: { onOff: true } }))).toBe('accessories.control.on')
      expect(getDeviceStatusText(device({ onOff: { onOff: false } }))).toBe('accessories.control.off')
    })

    it('pauses a running vacuum through the operational state cluster', async () => {
      const service = device({ rvcOperationalState: { operationalState: RvcOperationalState.Running } })

      await controlRvcDevice(service)

      expect(service.writes).toEqual([{
        cluster: 'rvcOperationalState',
        attributes: { operationalState: RvcOperationalState.Paused },
      }])
    })

    it('resumes a paused vacuum through the operational state cluster', async () => {
      const service = device({ rvcOperationalState: { operationalState: RvcOperationalState.Paused } })

      await controlRvcDevice(service)

      expect(service.writes).toEqual([{
        cluster: 'rvcOperationalState',
        attributes: { operationalState: RvcOperationalState.Running },
      }])
    })

    it.each([
      RvcOperationalState.Stopped,
      RvcOperationalState.Docked,
      RvcOperationalState.Charging,
    ])('starts a vacuum in state %i through the run mode cluster instead', async (state) => {
      const service = device({
        rvcOperationalState: { operationalState: state },
        rvcRunMode: { currentMode: 0 },
      })

      await controlRvcDevice(service)

      expect(service.writes).toEqual([{ cluster: 'rvcRunMode', attributes: { currentMode: 1 } }])
    })

    it('throws when the run mode cluster it needs to start is missing', async () => {
      // The operational state cluster is present but empty, so the state reads
      // as Stopped and the start path runs - and that path needs rvcRunMode.
      // The sibling "operational state cluster not found" branch cannot be
      // reached: an absent cluster makes the state read as Stopped, which
      // sends control down this path instead.
      await expect(controlRvcDevice(device({ rvcOperationalState: {} }))).rejects.toThrow('RvcRunMode cluster not found')
    })

    it('names the service areas, falling back to the area id', () => {
      const service = device({
        serviceArea: {
          supportedAreas: [
            { areaId: 1, areaInfo: { locationName: 'Kitchen' } },
            { areaId: 2 },
          ],
        },
      })

      expect(getServiceAreas(service)).toEqual([
        { areaId: 1, name: 'Kitchen' },
        { areaId: 2, name: 'Area 2' },
      ])
    })

    it('returns no areas when the cluster is absent or malformed', () => {
      expect(getServiceAreas(device())).toEqual([])
      expect(getServiceAreas(device({ serviceArea: { supportedAreas: 'nope' } }))).toEqual([])
      expect(hasServiceAreaCluster(device())).toBe(false)
      expect(hasServiceAreaCluster(device({ serviceArea: {} }))).toBe(true)
    })

    it('defaults the area and clean mode readings', () => {
      expect(getSelectedAreas(device())).toEqual([])
      expect(getCurrentArea(device())).toBeNull()
      expect(getAreaProgress(device())).toEqual([])
      expect(getCleanModes(device())).toEqual([])
      expect(getCurrentCleanMode(device())).toBe(0)
      expect(hasCleanModeCluster(device())).toBe(false)
      expect(hasCleanModeCluster(device({ rvcCleanMode: {} }))).toBe(true)
    })
  })

  describe('sensors', () => {
    it('inverts the contact sensor, because matter reports closed as true', () => {
      expect(getContactSensorState(device({ booleanState: { stateValue: false } }))).toBe(true)
      expect(getContactSensorState(device({ booleanState: { stateValue: true } }))).toBe(false)
    })

    it('does NOT invert the leak detector, though it reads the same attribute', () => {
      expect(getWaterLeakState(device({ booleanState: { stateValue: true } }))).toBe(true)
      expect(getWaterLeakState(device({ booleanState: { stateValue: false } }))).toBe(false)
    })

    it('reads occupancy out of its nested field', () => {
      expect(getOccupancySensorState(device({ occupancySensing: { occupancy: { occupied: true } } }))).toBe(true)
      expect(getOccupancySensorState(device({ occupancySensing: {} }))).toBe(false)
      expect(getOccupancySensorState(device())).toBe(false)
    })

    it('converts illuminance off its logarithmic scale', () => {
      // lux = 10 ^ ((measuredValue - 1) / 10000)
      expect(getLightSensorIlluminance(device({ illuminanceMeasurement: { measuredValue: 10001 } }))).toBeCloseTo(10, 6)
      expect(getLightSensorIlluminance(device({ illuminanceMeasurement: { measuredValue: 1 } }))).toBe(1)
    })

    it('reports zero lux for a zero or null reading, rather than the formula result', () => {
      expect(getLightSensorIlluminance(device({ illuminanceMeasurement: { measuredValue: 0 } }))).toBe(0)
      expect(getLightSensorIlluminance(device({ illuminanceMeasurement: { measuredValue: null } }))).toBe(0)
      expect(getLightSensorIlluminance(device())).toBe(0)
    })

    it('converts active power from milliwatts to watts', () => {
      expect(getActivePowerWatts(device({ electricalPowerMeasurement: { activePower: 12500 } }))).toBe(12.5)
      expect(getActivePowerWatts(device({ electricalPowerMeasurement: { activePower: 0 } }))).toBe(0)
    })

    it.each([
      ['null', null],
      ['undefined', undefined],
      ['a non-number', '500'],
    ])('reports no power reading for %s', (_case, activePower) => {
      expect(getActivePowerWatts(device({ electricalPowerMeasurement: { activePower } }))).toBeNull()
    })

    it('converts temperature and humidity from hundredths', () => {
      expect(getTemperatureSensorValue(device({ temperatureMeasurement: { measuredValue: 2150 } }))).toBe(21.5)
      expect(getHumiditySensorValue(device({ relativeHumidityMeasurement: { measuredValue: 4550 } }))).toBe(45.5)
    })

    it('keeps a genuine zero reading rather than falling back to null', () => {
      expect(getTemperatureSensorValue(device({ temperatureMeasurement: { measuredValue: 0 } }))).toBe(0)
      expect(getHumiditySensorValue(device({ relativeHumidityMeasurement: { measuredValue: 0 } }))).toBe(0)
    })

    it('reports no reading when the sensor cluster is absent', () => {
      expect(getTemperatureSensorValue(device())).toBeNull()
      expect(getHumiditySensorValue(device())).toBeNull()
    })

    it('defaults the alarm and air quality states to normal', () => {
      expect(getSmokeAlarmState(device())).toBe(0)
      expect(getCoAlarmState(device())).toBe(0)
      expect(getAirQualityValue(device())).toBe(0)
      expect(isSmokeCoAlarmTriggered(device())).toBe(false)
    })

    it.each([
      [{ smokeState: 1, coState: 0 }, true],
      [{ smokeState: 0, coState: 2 }, true],
      [{ smokeState: 0, coState: 0 }, false],
    ])('treats %o as triggered: %s', (smokeCoAlarm, expected) => {
      expect(isSmokeCoAlarmTriggered(device({ smokeCoAlarm }))).toBe(expected)
    })

    it('works out which of the two alarms a combined sensor actually has', () => {
      const smokeOnly = device({ smokeCoAlarm: { smokeState: 0 } })
      const coOnly = device({ smokeCoAlarm: { coState: 0 } })

      expect(hasSmokeAlarm(smokeOnly)).toBe(true)
      expect(hasCoAlarm(smokeOnly)).toBe(false)
      expect(hasSmokeAlarm(coOnly)).toBe(false)
      expect(hasCoAlarm(coOnly)).toBe(true)
    })

    it('lets the feature map override what the attributes imply', () => {
      const service = device({
        smokeCoAlarm: { smokeState: 0, coState: 0, featureMap: { smokeAlarm: true, coAlarm: false } },
      })

      expect(hasSmokeAlarm(service)).toBe(true)
      expect(hasCoAlarm(service)).toBe(false)
    })
  })

  describe('door lock', () => {
    it('defaults to locked, the safe reading', () => {
      expect(getDoorLockState(device())).toBe(1)
    })

    it('unlocks a locked door and locks anything else', async () => {
      const locked = device({ doorLock: { lockState: 1 } })
      const unlocked = device({ doorLock: { lockState: 2 } })
      const ajar = device({ doorLock: { lockState: 0 } })

      await toggleDoorLock(locked)
      await toggleDoorLock(unlocked)
      await toggleDoorLock(ajar)

      expect(locked.writes).toEqual([{ cluster: 'doorLock', attributes: { lockState: 2 } }])
      expect(unlocked.writes).toEqual([{ cluster: 'doorLock', attributes: { lockState: 1 } }])
      expect(ajar.writes).toEqual([{ cluster: 'doorLock', attributes: { lockState: 1 } }])
    })

    it('sets the state directly', async () => {
      const service = device({ doorLock: { lockState: 2 } })

      await setDoorLockState(service, true)

      expect(service.writes).toEqual([{ cluster: 'doorLock', attributes: { lockState: 1 } }])
    })

    it('throws when the cluster is missing', async () => {
      await expect(toggleDoorLock(device())).rejects.toThrow('Door lock cluster not found')
      await expect(setDoorLockState(device(), true)).rejects.toThrow('Door lock cluster not found')
    })
  })

  describe('window covering', () => {
    it.each([
      [0, 100],
      [2500, 75],
      [5000, 50],
      [10000, 0],
    ])('converts matter position %i to %i%% open', (position, percentage) => {
      expect(matterPositionToPercentage(position)).toBe(percentage)
      expect(percentageToMatterPosition(percentage)).toBe(position)
    })

    it('reads an absent lift position as fully open, which is the matter default', () => {
      expect(getWindowCoveringPercentage(device())).toBe(100)
    })

    it('detects lift and tilt from the declared attributes', () => {
      const liftOnly = device({ windowCovering: { currentPositionLiftPercent100ths: 0 } })
      const tiltOnly = device({ windowCovering: { currentPositionTiltPercent100ths: 0 } })

      expect(hasWindowCoveringLift(liftOnly)).toBe(true)
      expect(hasWindowCoveringTilt(liftOnly)).toBe(false)
      expect(hasWindowCoveringLift(tiltOnly)).toBe(false)
      expect(hasWindowCoveringTilt(tiltOnly)).toBe(true)
    })

    it('reads the tilt position on a blind that only tilts', () => {
      // Its lift position would default to 0, which reads as fully open
      const tiltOnly = device({ windowCovering: { currentPositionTiltPercent100ths: 10000 } })

      expect(getWindowCoveringTiltPercentage(tiltOnly)).toBe(0)
      expect(getWindowCoveringOpenPercentage(tiltOnly)).toBe(0)
    })

    it('reads the lift position when the covering has one', () => {
      const lift = device({ windowCovering: { currentPositionLiftPercent100ths: 2500 } })

      expect(getWindowCoveringOpenPercentage(lift)).toBe(75)
    })

    it('writes lift and tilt to their own attributes', async () => {
      const service = device({ windowCovering: { currentPositionLiftPercent100ths: 0 } })

      await setWindowCoveringPosition(service, 30)
      await setWindowCoveringTiltPosition(service, 30)

      expect(service.writes).toEqual([
        { cluster: 'windowCovering', attributes: { targetPositionLiftPercent100ths: 7000 } },
        { cluster: 'windowCovering', attributes: { targetPositionTiltPercent100ths: 7000 } },
      ])
    })

    it('closes a covering that is more than half open, and opens one that is not', async () => {
      const open = device({ windowCovering: { currentPositionLiftPercent100ths: 0 } })
      const closed = device({ windowCovering: { currentPositionLiftPercent100ths: 10000 } })

      await toggleWindowCovering(open)
      await toggleWindowCovering(closed)

      expect(open.writes).toEqual([{ cluster: 'windowCovering', attributes: { targetPositionLiftPercent100ths: 10000 } }])
      expect(closed.writes).toEqual([{ cluster: 'windowCovering', attributes: { targetPositionLiftPercent100ths: 0 } }])
    })

    it('drives the tilt attribute on a blind that only tilts', async () => {
      const tiltOnly = device({ windowCovering: { currentPositionTiltPercent100ths: 10000 } })

      await toggleWindowCovering(tiltOnly)

      expect(tiltOnly.writes).toEqual([{ cluster: 'windowCovering', attributes: { targetPositionTiltPercent100ths: 0 } }])
    })

    it('throws when the cluster is missing', async () => {
      await expect(setWindowCoveringPosition(device(), 50)).rejects.toThrow('Window covering cluster not found')
      await expect(setWindowCoveringTiltPosition(device(), 50)).rejects.toThrow('Window covering cluster not found')
    })
  })

  describe('water valve', () => {
    it('defaults to closed', () => {
      expect(getWaterValveState(device())).toBe(WaterValveState.Closed)
      expect(isWaterValveOpen(device())).toBe(false)
    })

    it('counts a valve moving towards open as open', () => {
      const opening = device({
        valveConfigurationAndControl: {
          currentState: WaterValveState.Transitioning,
          targetState: WaterValveState.Open,
        },
      })
      const closing = device({
        valveConfigurationAndControl: {
          currentState: WaterValveState.Transitioning,
          targetState: WaterValveState.Closed,
        },
      })

      expect(isWaterValveOpen(opening)).toBe(true)
      expect(isWaterValveOpen(closing)).toBe(false)
    })

    it('writes the target state, so the plugin handler runs', async () => {
      const service = device({ valveConfigurationAndControl: { currentState: WaterValveState.Closed } })

      await toggleWaterValve(service)

      expect(service.writes).toEqual([{
        cluster: 'valveConfigurationAndControl',
        attributes: { targetState: WaterValveState.Open },
      }])
    })

    it('throws when the cluster is missing', async () => {
      await expect(toggleWaterValve(device())).rejects.toThrow('ValveConfigurationAndControl cluster not found')
    })
  })

  describe('fan', () => {
    it('defaults to off', () => {
      expect(getFanMode(device())).toBe(0)
      expect(getFanPercentSetting(device())).toBe(0)
      expect(isFanOn(device())).toBe(false)
    })

    it.each([
      [{ fanMode: 0, percentSetting: 0 }, false],
      [{ fanMode: 1, percentSetting: 0 }, true],
      [{ fanMode: 0, percentSetting: 40 }, true],
    ])('treats %o as running: %s', (fanControl, expected) => {
      expect(isFanOn(device({ fanControl }))).toBe(expected)
    })

    it('toggles through the percent setting', async () => {
      const off = device({ fanControl: { fanMode: 0, percentSetting: 0 } })
      const on = device({ fanControl: { fanMode: 0, percentSetting: 40 } })

      await toggleFan(off)
      await toggleFan(on)

      expect(off.writes).toEqual([{ cluster: 'fanControl', attributes: { percentSetting: 100 } }])
      expect(on.writes).toEqual([{ cluster: 'fanControl', attributes: { percentSetting: 0 } }])
    })

    it('sets an explicit speed', async () => {
      const service = device({ fanControl: {} })

      await setFanSpeed(service, 65)

      expect(service.writes).toEqual([{ cluster: 'fanControl', attributes: { percentSetting: 65 } }])
    })

    it('throws when the cluster is missing', async () => {
      await expect(toggleFan(device())).rejects.toThrow('Fan control cluster not found')
      await expect(setFanSpeed(device(), 50)).rejects.toThrow('Fan control cluster not found')
    })
  })

  describe('thermostat', () => {
    it('converts the local temperature from hundredths', () => {
      expect(getThermostatLocalTemperature(device({ thermostat: { localTemperature: 2150 } }))).toBe(21.5)
    })

    it('falls back to the externally measured temperature', () => {
      const service = device({ thermostat: { externalMeasuredIndoorTemperature: 1800 } })

      expect(getThermostatLocalTemperature(service)).toBe(18)
      expect(getThermostatLocalTemperature(device())).toBeNull()
    })

    it('uses the documented default setpoints when none are declared', () => {
      expect(getThermostatHeatingSetpoint(device())).toBe(20)
      expect(getThermostatCoolingSetpoint(device())).toBe(24)
    })

    it('reports the system mode and whether it is on', () => {
      expect(getThermostatSystemMode(device())).toBe(0)
      expect(isThermostatOn(device())).toBe(false)
      expect(isThermostatOn(device({ thermostat: { systemMode: 4 } }))).toBe(true)
    })

    it('infers the supported modes from the declared setpoints', () => {
      const heatOnly = device({ thermostat: { occupiedHeatingSetpoint: 2000 } })
      const both = device({ thermostat: { occupiedHeatingSetpoint: 2000, occupiedCoolingSetpoint: 2400 } })

      expect(getThermostatSupportedModes(heatOnly)).toEqual({ heat: true, cool: false, auto: false })
      expect(getThermostatSupportedModes(both)).toEqual({ heat: true, cool: true, auto: true })
    })

    it('lets the feature map separate a heat+cool thermostat from one with auto', () => {
      const service = device({
        thermostat: {
          occupiedHeatingSetpoint: 2000,
          occupiedCoolingSetpoint: 2400,
          featureMap: { heating: true, cooling: true, autoMode: false },
        },
      })

      expect(getThermostatSupportedModes(service)).toEqual({ heat: true, cool: true, auto: false })
    })

    it('offers everything rather than an empty modal when nothing is known', () => {
      expect(getThermostatSupportedModes(device({ thermostat: {} }))).toEqual({ heat: true, cool: true, auto: true })
    })

    it('writes setpoints back in hundredths, rounded', async () => {
      const service = device({ thermostat: {} })

      await setThermostatHeatingSetpoint(service, 21.5)
      await setThermostatCoolingSetpoint(service, 23.456)
      await setThermostatSystemMode(service, 4)

      expect(service.writes).toEqual([
        { cluster: 'thermostat', attributes: { occupiedHeatingSetpoint: 2150 } },
        { cluster: 'thermostat', attributes: { occupiedCoolingSetpoint: 2346 } },
        { cluster: 'thermostat', attributes: { systemMode: 4 } },
      ])
    })

    it('throws when the cluster is missing', async () => {
      await expect(setThermostatSystemMode(device(), 4)).rejects.toThrow('Thermostat cluster not found')
      await expect(setThermostatHeatingSetpoint(device(), 20)).rejects.toThrow('Thermostat cluster not found')
      await expect(setThermostatCoolingSetpoint(device(), 24)).rejects.toThrow('Thermostat cluster not found')
    })
  })

  describe('air quality concentrations', () => {
    it('reports no reading for a cluster the device does not have', () => {
      expect(getPm25Value(device())).toBeNull()
      expect(getPm10Value(device())).toBeNull()
      expect(getCarbonMonoxideValue(device())).toBeNull()
      expect(getNitrogenDioxideValue(device())).toBeNull()
      expect(getOzoneValue(device())).toBeNull()
      expect(hasConcentrationData(device())).toBe(false)
    })

    it('reports data when any one concentration is present', () => {
      expect(hasConcentrationData(device({ ozoneConcentrationMeasurement: { measuredValue: 4 } }))).toBe(true)
      expect(getOzoneValue(device({ ozoneConcentrationMeasurement: { measuredValue: 4 } }))).toBe(4)
    })

    it.each([
      [0, 'ppm'],
      [1, 'ppb'],
      [2, 'ppt'],
      [3, 'mg/m³'],
      [4, 'µg/m³'],
    ])('uses the declared measurement unit %i', (measurementUnit, expected) => {
      const service = device({ pm25ConcentrationMeasurement: { measurementUnit } })

      expect(getConcentrationUnit(service, 'pm25ConcentrationMeasurement')).toBe(expected)
    })

    it.each([
      ['pm25ConcentrationMeasurement', 'µg/m³'],
      ['pm10ConcentrationMeasurement', 'µg/m³'],
      ['carbonMonoxideConcentrationMeasurement', 'ppm'],
      ['nitrogenDioxideConcentrationMeasurement', 'ppb'],
      ['ozoneConcentrationMeasurement', 'ppb'],
    ] as const)('falls back to the conventional unit for %s', (cluster, expected) => {
      expect(getConcentrationUnit(device(), cluster)).toBe(expected)
    })
  })

  /**
   * Driving a robotic vacuum.
   *
   * ⚠️ **Which cluster the write goes to depends on what the vacuum is doing.**
   * Pausing and resuming go to `rvcOperationalState`; starting a clean from docked
   * has to go to `rvcRunMode` instead, because a docked vacuum will not accept an
   * operational state of "running". Getting that wrong looks like a vacuum that
   * ignores the button.
   */
  describe('controlling a robotic vacuum', () => {
    /**
     * A vacuum in a given state, with both clusters present.
     * @param state - its operational state
     */
    function vacuum(state: number) {
      return device({
        rvcOperationalState: { operationalState: state },
        rvcRunMode: { currentMode: RvcRunMode.Idle },
      }, 'RoboticVacuumCleaner')
    }

    it('pauses one that is running', async () => {
      const service = vacuum(RvcOperationalState.Running)

      await controlRvcDevice(service)

      expect(service.writes).toEqual([
        { cluster: 'rvcOperationalState', attributes: { operationalState: RvcOperationalState.Paused } },
      ])
    })

    it('resumes one that is paused', async () => {
      const service = vacuum(RvcOperationalState.Paused)

      await controlRvcDevice(service)

      expect(service.writes).toEqual([
        { cluster: 'rvcOperationalState', attributes: { operationalState: RvcOperationalState.Running } },
      ])
    })

    it.each([
      ['stopped', RvcOperationalState.Stopped],
      ['docked', RvcOperationalState.Docked],
      ['charging', RvcOperationalState.Charging],
    ])('starts a clean on one that is %s, through the run mode', async (_label, state) => {
      // ⚠️ Not through the operational state: a docked vacuum refuses that
      const service = vacuum(state)

      await controlRvcDevice(service)

      expect(service.writes).toEqual([
        { cluster: 'rvcRunMode', attributes: { currentMode: RvcRunMode.Cleaning } },
      ])
    })

    it('refuses to pause a vacuum with no operational state cluster', async () => {
      const service = device({ rvcOperationalState: { operationalState: RvcOperationalState.Running } })
      ;(service as any).getCluster = () => null

      await expect(controlRvcDevice(service)).rejects.toThrow('RVC operational state cluster not found')
    })

    it('refuses to start a vacuum with no run mode cluster', async () => {
      const service = device({ rvcOperationalState: { operationalState: RvcOperationalState.Docked } })

      await expect(controlRvcDevice(service)).rejects.toThrow('RvcRunMode cluster not found')
    })

    it('passes on a pause the device refused', async () => {
      const service = vacuum(RvcOperationalState.Running)
      service.failWrites('rvcOperationalState', new Error('device unreachable'))

      await expect(controlRvcDevice(service)).rejects.toThrow('device unreachable')
    })

    it('passes on a start the device refused', async () => {
      const service = vacuum(RvcOperationalState.Docked)
      service.failWrites('rvcRunMode', new Error('device unreachable'))

      await expect(controlRvcDevice(service)).rejects.toThrow('device unreachable')
    })
  })

  /**
   * Switching a dimmable light.
   *
   * ⚠️ **Off goes through `onOff`, not through the level.** Writing a level of 0 is
   * clamped up to the device's minimum — usually 1 — so the light stays faintly on.
   * On goes through `levelControl`, restoring the previous brightness, because
   * turning on at whatever level it was left at is what the user expects.
   */
  describe('toggling a dimmable light', () => {
    /**
     * A dimmable light.
     * @param options - its current state
     * @param options.on - whether it is on
     * @param options.level - its current brightness
     */
    function light(options: { on: boolean, level: number }) {
      return device({
        onOff: { onOff: options.on },
        levelControl: { currentLevel: options.level },
      }, 'DimmableLight')
    }

    it('turns a light that is on off through the on/off cluster', async () => {
      const service = light({ on: true, level: 128 })

      await toggleDimmableLight(service)

      expect(service.writes).toEqual([{ cluster: 'onOff', attributes: { onOff: false } }])
    })

    it('turns a light on at the level it was last on at', async () => {
      const service = light({ on: false, level: 60 })

      await toggleDimmableLight(service)

      expect(service.writes).toEqual([{ cluster: 'levelControl', attributes: { currentLevel: 60 } }])
    })

    it('turns a light left at zero on at full brightness', async () => {
      // Otherwise switching it on leaves it dark
      const service = light({ on: false, level: 0 })

      await toggleDimmableLight(service)

      expect(service.writes).toEqual([{ cluster: 'levelControl', attributes: { currentLevel: 254 } }])
    })

    it('refuses to turn off a light with no on/off cluster', async () => {
      const service = light({ on: true, level: 128 })
      ;(service as any).getCluster = () => null

      await expect(toggleDimmableLight(service)).rejects.toThrow('OnOff cluster not found')
    })

    it('refuses to turn on a light with no level cluster', async () => {
      const service = device({ onOff: { onOff: false } }, 'DimmableLight')

      await expect(toggleDimmableLight(service)).rejects.toThrow('LevelControl cluster not found')
    })

    it('passes on an off the device refused', async () => {
      const service = light({ on: true, level: 128 })
      service.failWrites('onOff', new Error('device unreachable'))

      await expect(toggleDimmableLight(service)).rejects.toThrow('device unreachable')
    })

    it('passes on an on the device refused', async () => {
      const service = light({ on: false, level: 128 })
      service.failWrites('levelControl', new Error('device unreachable'))

      await expect(toggleDimmableLight(service)).rejects.toThrow('device unreachable')
    })
  })

  /**
   * What happens when the device refuses a write.
   *
   * ⚠️ **Every one of these has to rethrow.** The tile and the manage modal both
   * set their control optimistically and undo it in their own catch, so a helper
   * that swallowed the failure would leave the whole UI showing a state the
   * device never reached — a lock shown as locked on a door that is not.
   */
  describe('when the device refuses the write', () => {
    it.each([
      [
        'unlocking a door',
        () => device({ doorLock: { lockState: 1 } }),
        'doorLock',
        (service: MatterServiceFixture) => toggleDoorLock(service),
      ],
      [
        'opening a water valve',
        () => device({ valveConfigurationAndControl: { currentState: 0, targetState: 0 } }),
        'valveConfigurationAndControl',
        (service: MatterServiceFixture) => toggleWaterValve(service),
      ],
      [
        'switching a fan on',
        () => device({ fanControl: { fanMode: 0, percentSetting: 0 } }),
        'fanControl',
        (service: MatterServiceFixture) => toggleFan(service),
      ],
      [
        'setting a cooling setpoint',
        () => device({ thermostat: { occupiedCoolingSetpoint: 2400 } }),
        'thermostat',
        (service: MatterServiceFixture) => setThermostatCoolingSetpoint(service, 22),
      ],
      [
        'pausing a running vacuum',
        () => device({ rvcOperationalState: { operationalState: 1 } }),
        'rvcOperationalState',
        (service: MatterServiceFixture) => controlRvcDevice(service),
      ],
      [
        'resuming a paused vacuum',
        () => device({ rvcOperationalState: { operationalState: 2 } }),
        'rvcOperationalState',
        (service: MatterServiceFixture) => controlRvcDevice(service),
      ],
    ])('passes the failure on when %s', async (_case, build, cluster, act) => {
      const service = build()
      service.failWrites(cluster, new Error('device offline'))

      await expect(act(service)).rejects.toThrow('device offline')
      expect(console.error).toHaveBeenCalled()
    })
  })
})
