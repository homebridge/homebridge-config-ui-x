import type { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import type { AccessoriesService } from '@/app/core/accessories/accessories.service'
import type { FakeSettings, FakeToastr, MatterServiceFixture } from '@/testing'

import { DecimalPipe, UpperCasePipe } from '@angular/common'
import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'
import { Subject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ACCESSORY_MANAGE_MODAL_DATA } from '@/app/core/accessories/types/base-manage.component'
import { AirQualitySensorManageComponent } from '@/app/core/accessories/types/matter/air-quality-sensor/air-quality-sensor.manage.component'
import { DoorLockManageComponent } from '@/app/core/accessories/types/matter/door-lock/door-lock.manage.component'
import { MatterFanManageComponent } from '@/app/core/accessories/types/matter/fan/fan.manage.component'
import { RoboticVacuumCleanerManageComponent } from '@/app/core/accessories/types/matter/robotic-vacuum-cleaner/robotic-vacuum-cleaner.manage.component'
import { MatterThermostatManageComponent } from '@/app/core/accessories/types/matter/thermostat/thermostat.manage.component'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { activeModalStub, makeSettings, matterService, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The five matter manage modals not covered elsewhere.
 *
 * Their cluster writes go through the helpers in `matter-device.utils.ts`, which
 * have their own spec, so what these assert is the layer above: how each modal
 * derives its state from the clusters, which controls it offers at all, and what
 * it puts back when a write is refused.
 *
 * ⚠️ Matter reports temperatures in hundredths of a degree. Every setpoint here
 * is therefore `2000` for 20°C — getting that factor wrong is a silent 100×
 * error, which is why the conversions are asserted explicitly.
 */
describe('the remaining matter manage modals', () => {
  let toastr: FakeToastr
  let settings: FakeSettings
  let accessoryData: Subject<unknown>

  function accessoriesStub(current: ServiceTypeX) {
    accessoryData = new Subject()
    return {
      accessoryData,
      accessories: { services: [current] },
    } as unknown as AccessoriesService
  }

  /**
   * Build a modal.
   *
   * ⚠️ NouisliderComponent and FormsModule are both dropped: the sliders carry
   * `[(ngModel)]`, and leaving NgModel active with the element unknown fails
   * with NG01203.
   * @param type - the modal component
   * @param service - the accessory it is opened for
   * @param temperatureUnits - the unit the user chose
   */
  function create<T>(type: new (...args: any[]) => T, service: ServiceTypeX, temperatureUnits: 'c' | 'f' = 'c'): T {
    TestBed.resetTestingModule()
    toastr = toastrStub()
    settings = makeSettings({ env: { temperatureUnits } })

    TestBed.configureTestingModule({
      imports: [type as any],
      providers: [
        provideTestTranslate(),
        provideFakes({ toastr, settings }),
        { provide: NgbActiveModal, useValue: activeModalStub() },
        {
          provide: ACCESSORY_MANAGE_MODAL_DATA,
          useValue: { service, $accessories: accessoriesStub(service) },
        },
      ],
    })

    TestBed.overrideComponent(type as any, {
      set: {
        imports: [TranslatePipe, ConvertTempPipe, DecimalPipe, UpperCasePipe],
        schemas: [NO_ERRORS_SCHEMA],
      },
    })

    const fixture = TestBed.createComponent(type as any)
    fixture.detectChanges()
    return fixture.componentInstance as T
  }

  /** Push a slider change through the base class's 500ms debounce. */
  async function slide(action: () => void) {
    action()
    await vi.advanceTimersByTimeAsync(500)
  }

  function mouseEvent() {
    return { target: document.createElement('button') } as unknown as MouseEvent
  }

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(console.error).mockClear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('thermostat', () => {
    function thermostat(overrides: Record<string, unknown> = {}): MatterServiceFixture {
      return matterService({
        deviceType: 'Thermostat',
        clusters: {
          thermostat: {
            localTemperature: 2050,
            systemMode: 1,
            occupiedHeatingSetpoint: 2000,
            occupiedCoolingSetpoint: 2400,
            ...overrides,
          },
        },
      })
    }

    it('reads the setpoints out of hundredths of a degree', () => {
      const component = create(MatterThermostatManageComponent, thermostat())

      expect(component.targetHeatingTemp).toBe(20)
      expect(component.targetCoolingTemp).toBe(24)
      expect(component.autoTemp).toEqual([20, 24])
      expect(component.currentTemperature).toBe(20.5)
    })

    it('writes a heating setpoint back in hundredths', async () => {
      const service = thermostat()
      const component = create(MatterThermostatManageComponent, service)

      await slide(() => {
        component.targetHeatingTemp = 22
        component.onHeatingTempChange()
      })

      expect(service.writes).toEqual([
        { cluster: 'thermostat', attributes: { occupiedHeatingSetpoint: 2200 } },
      ])
    })

    it('writes a cooling setpoint back in hundredths', async () => {
      const service = thermostat()
      const component = create(MatterThermostatManageComponent, service)

      await slide(() => {
        component.targetCoolingTemp = 26
        component.onCoolingTempChange()
      })

      expect(service.writes).toEqual([
        { cluster: 'thermostat', attributes: { occupiedCoolingSetpoint: 2600 } },
      ])
    })

    it('writes both setpoints in auto mode, heating first', async () => {
      const service = thermostat({ systemMode: 1 })
      const component = create(MatterThermostatManageComponent, service)

      await slide(() => {
        component.autoTemp = [19, 27]
        component.onAutoTempChange()
      })

      expect(service.writes).toEqual([
        { cluster: 'thermostat', attributes: { occupiedHeatingSetpoint: 1900 } },
        { cluster: 'thermostat', attributes: { occupiedCoolingSetpoint: 2700 } },
      ])
    })

    it('keeps the pair in step when the auto range moves', () => {
      const component = create(MatterThermostatManageComponent, thermostat())

      component.autoTemp = [18, 28]
      component.onAutoTempChange()

      expect(component.targetHeatingTemp).toBe(18)
      expect(component.targetCoolingTemp).toBe(28)
    })

    it('puts the setpoint back when the write is refused', async () => {
      const service = thermostat()
      service.failWrites('thermostat', new Error('device offline'))
      const component = create(MatterThermostatManageComponent, service)

      await slide(() => {
        component.targetHeatingTemp = 22
        component.onHeatingTempChange()
      })

      expect(component.targetHeatingTemp).toBe(20)
      expect(toastr.error).toHaveBeenCalled()
    })

    it('puts both setpoints back when an auto write is refused', async () => {
      // ⚠️ Auto mode has its own revert, and it has to put the paired range back
      // as well as the two numbers - the slider reads the pair, so leaving it
      // stale shows a range the thermostat never accepted
      const service = thermostat({ systemMode: 1 })
      service.failWrites('thermostat', new Error('device offline'))
      const component = create(MatterThermostatManageComponent, service)

      await slide(() => {
        component.autoTemp = [15, 30]
        component.onAutoTempChange()
      })

      expect(component.targetHeatingTemp).toBe(20)
      expect(component.targetCoolingTemp).toBe(24)
      expect(component.autoTemp).toEqual([20, 24])
      expect(toastr.error).toHaveBeenCalled()
    })

    it('reads the setpoint limits off the cluster', () => {
      const component = create(MatterThermostatManageComponent, thermostat({
        minHeatSetpointLimit: 500,
        maxHeatSetpointLimit: 2800,
        minCoolSetpointLimit: 1600,
        maxCoolSetpointLimit: 3200,
      }))

      expect(component.minHeatSetpoint).toBe(5)
      expect(component.maxHeatSetpoint).toBe(28)
      expect(component.minCoolSetpoint).toBe(16)
      expect(component.maxCoolSetpoint).toBe(32)
    })

    it('keeps a limit of zero degrees rather than treating it as missing', () => {
      // A truthiness check here replaced a legitimate 0°C limit with the 7°C
      // default, and no cold-climate thermostat could be set below it
      const component = create(MatterThermostatManageComponent, thermostat({ minHeatSetpointLimit: 0 }))

      expect(component.minHeatSetpoint).toBe(0)
    })

    it('falls back to sensible limits when the device declares none', () => {
      const component = create(MatterThermostatManageComponent, thermostat())

      expect(component.minHeatSetpoint).toBe(7)
      expect(component.maxHeatSetpoint).toBe(30)
      expect(component.minCoolSetpoint).toBe(10)
      expect(component.maxCoolSetpoint).toBe(35)
    })

    it('offers only the modes the device actually has', () => {
      // Showing an Auto button on a thermostat without the AutoMode feature
      // means a write the device rejects
      const component = create(MatterThermostatManageComponent, matterService({
        deviceType: 'Thermostat',
        clusters: {
          thermostat: {
            localTemperature: 2050,
            systemMode: 4,
            occupiedHeatingSetpoint: 2000,
            featureMap: { heating: true, cooling: false, autoMode: false },
          },
        },
      }))

      expect(component.supportedModes).toEqual({ heat: true, cool: false, auto: false })
    })

    it('writes a mode change to the thermostat cluster', async () => {
      const service = thermostat()
      const component = create(MatterThermostatManageComponent, service)

      await component.setTargetMode(3, mouseEvent())

      expect(service.writes).toEqual([
        { cluster: 'thermostat', attributes: { systemMode: 3 } },
      ])
      expect(component.targetMode).toBe(3)
    })

    it('puts the mode back when the write is refused', async () => {
      const service = thermostat({ systemMode: 4 })
      service.failWrites('thermostat', new Error('device offline'))
      const component = create(MatterThermostatManageComponent, service)

      await component.setTargetMode(3, mouseEvent())

      expect(component.targetMode).toBe(4)
      expect(toastr.error).toHaveBeenCalled()
    })

    it.each([
      ['status-color-cooling', 3],
      ['status-color-heating', 4],
      ['status-color-active', 1],
      ['status-color-inactive', 0],
    ])('shows %s for the matching system mode', (expected, systemMode) => {
      const component = create(MatterThermostatManageComponent, thermostat({ systemMode }))

      expect(component.getStatusClass()).toBe(expected)
    })

    it('takes the temperature unit from the user settings', () => {
      const component = create(MatterThermostatManageComponent, thermostat(), 'f')

      expect(component.temperatureUnits).toBe('f')
    })

    it('follows a change made elsewhere', () => {
      const component = create(MatterThermostatManageComponent, thermostat())

      const updated = thermostat({ systemMode: 3, occupiedHeatingSetpoint: 1500, occupiedCoolingSetpoint: 3000 })
      component.$accessories.accessories.services[0] = updated
      accessoryData.next([updated])

      expect(component.targetMode).toBe(3)
      expect(component.autoTemp).toEqual([15, 30])
    })
  })

  describe('fan', () => {
    function fan(percentSetting = 50, fanMode = 2): MatterServiceFixture {
      return matterService({
        deviceType: 'Fan',
        clusters: { fanControl: { fanMode, percentSetting, percentCurrent: percentSetting } },
      })
    }

    it('reads the speed as a percentage', () => {
      const component = create(MatterFanManageComponent, fan(75))

      expect(component.targetSpeed.value).toBe(75)
      expect(component.targetMode).toBe(true)
    })

    it('reads a fan at zero as off', () => {
      const component = create(MatterFanManageComponent, fan(0, 0))

      expect(component.targetMode).toBe(false)
    })

    it('writes a speed change to fanControl', async () => {
      const service = fan()
      const component = create(MatterFanManageComponent, service)

      await slide(() => {
        component.targetSpeed.value = 25
        component.onTargetSpeedChange()
      })

      expect(service.writes.map(write => write.cluster)).toEqual(['fanControl'])
    })

    it('turns a fan sitting at zero on at full speed', async () => {
      const service = fan(0, 0)
      const component = create(MatterFanManageComponent, service)

      await component.setTargetMode(true, mouseEvent())

      expect(service.writes.at(-1)?.attributes).toMatchObject({ percentSetting: 100 })
    })

    it('keeps the speed it had when switching a stopped fan back on', async () => {
      const service = fan(40, 0)
      const component = create(MatterFanManageComponent, service)

      await component.setTargetMode(true, mouseEvent())

      expect(service.writes.at(-1)?.attributes).toMatchObject({ percentSetting: 40 })
    })

    it('writes zero when switched off', async () => {
      const service = fan(50)
      const component = create(MatterFanManageComponent, service)

      await component.setTargetMode(false, mouseEvent())

      expect(service.writes.at(-1)?.attributes).toMatchObject({ percentSetting: 0 })
      expect(component.targetMode).toBe(false)
    })

    it('puts the slider back when the write is refused', async () => {
      const service = fan(50)
      service.failWrites('fanControl', new Error('device offline'))
      const component = create(MatterFanManageComponent, service)

      await slide(() => {
        component.targetSpeed.value = 90
        component.onTargetSpeedChange()
      })

      expect(component.targetSpeed.value).toBe(50)
      expect(toastr.error).toHaveBeenCalled()
    })
  })

  describe('door lock', () => {
    function lock(lockState = 1): MatterServiceFixture {
      return matterService({ deviceType: 'DoorLock', clusters: { doorLock: { lockState } } })
    }

    it('reads the lock state', () => {
      expect(create(DoorLockManageComponent, lock(1)).targetMode).toBe(1)
      expect(create(DoorLockManageComponent, lock(2)).targetMode).toBe(2)
    })

    it('writes to the doorLock cluster when locking', async () => {
      const service = lock(2)
      const component = create(DoorLockManageComponent, service)

      await component.setTargetMode(1, mouseEvent())

      expect(service.writes.map(write => write.cluster)).toEqual(['doorLock'])
      expect(component.targetMode).toBe(1)
    })

    it('writes to the doorLock cluster when unlocking', async () => {
      const service = lock(1)
      const component = create(DoorLockManageComponent, service)

      await component.setTargetMode(2, mouseEvent())

      expect(service.writes.map(write => write.cluster)).toEqual(['doorLock'])
      expect(component.targetMode).toBe(2)
    })

    it('puts the lock back when the write is refused', async () => {
      // Otherwise the modal claims a door is locked when it is not
      const service = lock(2)
      service.failWrites('doorLock', new Error('jammed'))
      const component = create(DoorLockManageComponent, service)

      await component.setTargetMode(1, mouseEvent())

      expect(component.targetMode).toBe(2)
      expect(toastr.error).toHaveBeenCalled()
    })
  })

  describe('robotic vacuum cleaner', () => {
    function vacuum(options: {
      operationalState?: number
      runMode?: number
      cleanMode?: boolean
      areas?: boolean
    } = {}): MatterServiceFixture {
      const clusters: Record<string, Record<string, unknown>> = {
        rvcRunMode: {
          currentMode: options.runMode ?? 0,
          supportedModes: [{ label: 'Idle', mode: 0 }, { label: 'Clean', mode: 1 }],
        },
        rvcOperationalState: { operationalState: options.operationalState ?? 0 },
      }
      if (options.cleanMode) {
        clusters.rvcCleanMode = {
          currentMode: 1,
          supportedModes: [{ label: 'Vacuum', mode: 1 }, { label: 'Mop', mode: 2 }],
        }
      }
      if (options.areas) {
        clusters.serviceArea = {
          supportedAreas: [
            { areaId: 1, areaInfo: { locationInfo: { locationName: 'Kitchen' } } },
            { areaId: 2, areaInfo: { locationInfo: { locationName: 'Hallway' } } },
          ],
          selectedAreas: [1],
          currentArea: 1,
          progress: [],
        }
      }
      return matterService({ deviceType: 'RoboticVacuumCleaner', clusters })
    }

    it('reads a running vacuum as cleaning', () => {
      // The UI mode comes from the operational state, not the run mode
      const component = create(RoboticVacuumCleanerManageComponent, vacuum({ operationalState: 1 }))

      expect(component.currentMode).toBe(1)
    })

    it('reads a paused vacuum as paused', () => {
      const component = create(RoboticVacuumCleanerManageComponent, vacuum({ operationalState: 2 }))

      expect(component.currentMode).toBe(2)
    })

    it.each([
      ['stopped', 0],
      ['in error', 3],
      ['seeking its charger', 64],
      ['docked', 66],
    ])('reads a vacuum that is %s as idle', (_label, operationalState) => {
      const component = create(RoboticVacuumCleanerManageComponent, vacuum({ operationalState }))

      expect(component.currentMode).toBe(0)
    })

    it('starts a clean through the run mode cluster', async () => {
      const service = vacuum({ operationalState: 0 })
      const component = create(RoboticVacuumCleanerManageComponent, service)

      await component.setMode(1, mouseEvent())

      expect(service.writes).toEqual([
        { cluster: 'rvcRunMode', attributes: { currentMode: 1 } },
      ])
    })

    it('stops a clean through the run mode cluster', async () => {
      const service = vacuum({ operationalState: 1 })
      const component = create(RoboticVacuumCleanerManageComponent, service)

      await component.setMode(0, mouseEvent())

      expect(service.writes).toEqual([
        { cluster: 'rvcRunMode', attributes: { currentMode: 0 } },
      ])
    })

    it('pauses through the operational state cluster instead', async () => {
      // Pause is not a run mode, so it goes somewhere else entirely
      const service = vacuum({ operationalState: 1 })
      const component = create(RoboticVacuumCleanerManageComponent, service)

      await component.setMode(2, mouseEvent())

      expect(service.writes).toEqual([
        { cluster: 'rvcOperationalState', attributes: { operationalState: 2 } },
      ])
    })

    it('refuses to pause a vacuum that is not running', async () => {
      const service = vacuum({ operationalState: 0 })
      const component = create(RoboticVacuumCleanerManageComponent, service)

      await component.setMode(2, mouseEvent())

      expect(service.writes).toEqual([])
      expect(component.isPauseDisabled).toBe(true)
    })

    it('complains rather than writing nowhere when the clean mode cluster is missing', async () => {
      const component = create(RoboticVacuumCleanerManageComponent, vacuum())

      await component.setCleanMode(2, mouseEvent())

      expect(toastr.error).toHaveBeenCalled()
    })

    it('follows a change made elsewhere', () => {
      // The dashboard polls, so a clean started from the vacuum's own app has to
      // show up here
      const component = create(RoboticVacuumCleanerManageComponent, vacuum({ operationalState: 0 }))

      const updated = vacuum({ operationalState: 1, runMode: 1 })
      component.$accessories.accessories.services[0] = updated
      accessoryData.next([updated])

      expect(component.isPauseDisabled).toBe(false)
    })

    it('allows pausing while it is cleaning', () => {
      const component = create(RoboticVacuumCleanerManageComponent, vacuum({ operationalState: 1 }))

      expect(component.isPauseDisabled).toBe(false)
    })

    it('puts the mode back when the write is refused', async () => {
      const service = vacuum({ operationalState: 0 })
      service.failWrites('rvcRunMode', new Error('device offline'))
      const component = create(RoboticVacuumCleanerManageComponent, service)

      await component.setMode(1, mouseEvent())

      expect(component.currentMode).toBe(0)
      expect(toastr.error).toHaveBeenCalled()
    })

    it('offers the clean modes only to a vacuum that has them', () => {
      const withModes = create(RoboticVacuumCleanerManageComponent, vacuum({ cleanMode: true }))
      expect(withModes.hasCleanMode).toBe(true)
      expect(withModes.cleanModes).toEqual([{ label: 'Vacuum', mode: 1 }, { label: 'Mop', mode: 2 }])

      const without = create(RoboticVacuumCleanerManageComponent, vacuum())
      expect(without.hasCleanMode).toBe(false)
    })

    it('writes a clean mode change to its own cluster', async () => {
      const service = vacuum({ cleanMode: true })
      const component = create(RoboticVacuumCleanerManageComponent, service)

      await component.setCleanMode(2, mouseEvent())

      expect(service.writes).toEqual([
        { cluster: 'rvcCleanMode', attributes: { currentMode: 2 } },
      ])
      expect(component.currentCleanModeId).toBe(2)
    })

    it('puts the clean mode back when the write is refused', async () => {
      const service = vacuum({ cleanMode: true })
      service.failWrites('rvcCleanMode', new Error('device offline'))
      const component = create(RoboticVacuumCleanerManageComponent, service)

      await component.setCleanMode(2, mouseEvent())

      expect(component.currentCleanModeId).toBe(1)
    })

    it('offers the room list only to a vacuum that maps rooms', () => {
      const withAreas = create(RoboticVacuumCleanerManageComponent, vacuum({ areas: true }))
      expect(withAreas.hasServiceArea).toBe(true)
      expect(withAreas.areas.map(area => area.areaId)).toEqual([1, 2])
      expect(withAreas.selectedAreaIds).toEqual([1])

      const without = create(RoboticVacuumCleanerManageComponent, vacuum())
      expect(without.hasServiceArea).toBe(false)
    })

    it('adds a room to the selection and sends the whole list', async () => {
      // The cluster takes the complete selection, not a delta
      const service = vacuum({ areas: true })
      const component = create(RoboticVacuumCleanerManageComponent, service)

      await component.toggleAreaSelection(2)

      expect(component.isAreaSelected(2)).toBe(true)
      expect(service.writes).toEqual([
        { cluster: 'serviceArea', attributes: { selectedAreas: [1, 2] } },
      ])
    })

    it('takes a room back out of the selection', async () => {
      const service = vacuum({ areas: true })
      const component = create(RoboticVacuumCleanerManageComponent, service)

      await component.toggleAreaSelection(1)

      expect(component.isAreaSelected(1)).toBe(false)
      expect(service.writes).toEqual([
        { cluster: 'serviceArea', attributes: { selectedAreas: [] } },
      ])
    })

    it('puts the selection back when the write is refused', async () => {
      const service = vacuum({ areas: true })
      service.failWrites('serviceArea', new Error('device offline'))
      const component = create(RoboticVacuumCleanerManageComponent, service)

      await component.toggleAreaSelection(2)

      expect(component.selectedAreaIds).toEqual([1])
      expect(toastr.error).toHaveBeenCalled()
    })
  })

  describe('air quality sensor', () => {
    function sensor(clusters: Record<string, Record<string, unknown>>): MatterServiceFixture {
      return matterService({ deviceType: 'AirQualitySensor', clusters })
    }

    it('reads the overall air quality', () => {
      const component = create(AirQualitySensorManageComponent, sensor({ airQuality: { airQuality: 3 } }))

      expect(component.airQuality).toBe(3)
    })

    it('reads each concentration the sensor reports', () => {
      const component = create(AirQualitySensorManageComponent, sensor({
        airQuality: { airQuality: 2 },
        pm25ConcentrationMeasurement: { measuredValue: 12 },
        pm10ConcentrationMeasurement: { measuredValue: 20 },
        carbonMonoxideConcentrationMeasurement: { measuredValue: 3 },
      }))

      expect(component.pm25).toBe(12)
      expect(component.pm10).toBe(20)
      expect(component.co).toBe(3)
    })

    it('leaves a concentration the sensor does not report as unknown', () => {
      // Rather than showing zero, which reads as a good measurement
      const component = create(AirQualitySensorManageComponent, sensor({ airQuality: { airQuality: 2 } }))

      expect(component.pm25).toBeNull()
      expect(component.no2).toBeNull()
      expect(component.ozone).toBeNull()
    })

    it('shows the concentration panel only when there is something in it', () => {
      const withData = create(AirQualitySensorManageComponent, sensor({
        airQuality: { airQuality: 2 },
        pm25ConcentrationMeasurement: { measuredValue: 12 },
      }))
      expect(withData.hasConcentration).toBe(true)

      const without = create(AirQualitySensorManageComponent, sensor({ airQuality: { airQuality: 2 } }))
      expect(without.hasConcentration).toBe(false)
    })
  })
})
