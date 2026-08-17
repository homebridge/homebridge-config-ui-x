import type { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import type { AccessoriesService } from '@/app/core/accessories/accessories.service'
import type { FakeModalService } from '@/testing'

import { DecimalPipe, LowerCasePipe, UpperCasePipe } from '@angular/common'
import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TranslatePipe } from '@ngx-translate/core'
import { describe, expect, it, vi } from 'vitest'

import { AccessoriesService as AccessoriesServiceToken } from '@/app/core/accessories/accessories.service'
import { AirQualitySensorComponent } from '@/app/core/accessories/types/hap/air-quality-sensor/air-quality-sensor.component'
import { TemperatureSensorComponent } from '@/app/core/accessories/types/hap/temperature-sensor/temperature-sensor.component'
import { MatterAirQualitySensorComponent } from '@/app/core/accessories/types/matter/air-quality-sensor/air-quality-sensor.component'
import { MatterSmokeCoAlarmComponent } from '@/app/core/accessories/types/matter/smoke-co-alarm/smoke-co-alarm.component'
import { MatterTemperatureSensorComponent } from '@/app/core/accessories/types/matter/temperature-sensor/temperature-sensor.component'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { characteristic, hapService, makeSettings, matterService, modalServiceSpy, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The read-only sensor tiles.
 *
 * ⚠️ Most of them are **deliberately not covered here, because there is nothing
 * in them to assert.** Motion, contact, occupancy, leak, smoke, light, humidity,
 * carbon monoxide, carbon dioxide, battery, irrigation, access code, generic
 * switch, the stateless programmable switch and both unknown tiles are a single
 * `input.required<ServiceTypeX>()` and a template — or one `computed()` wrapping
 * a getter that `matter-device.utils.spec.ts` already covers. A spec for those
 * would test Angular, not this app.
 *
 * What IS here is the handful with real rules of their own: the two air quality
 * tiles decide whether they have anything worth opening a modal for, the matter
 * smoke/CO alarm works out which kind of alarm it actually is, and the two
 * temperature tiles have to read the user's unit.
 */
describe('the sensor tiles', () => {
  let modal: FakeModalService

  /**
   * Build a tile.
   * @param type - the tile component
   * @param service - the accessory service it renders
   * @param temperatureUnits - the unit the user chose
   */
  function create<T>(type: new (...args: any[]) => T, service: ServiceTypeX, temperatureUnits: 'c' | 'f' = 'c'): T {
    TestBed.resetTestingModule()
    modal = modalServiceSpy()

    TestBed.configureTestingModule({
      imports: [type as any],
      providers: [
        provideTestTranslate(),
        provideFakes({
          modal,
          toastr: toastrStub(),
          settings: makeSettings({ env: { temperatureUnits } }),
        }),
        { provide: AccessoriesServiceToken, useValue: { accessoryData: { subscribe: vi.fn() } } as unknown as AccessoriesService },
      ],
    })

    TestBed.overrideComponent(type as any, {
      // ⚠️ Trap: NO_ERRORS_SCHEMA tolerates unknown elements and attributes but
      // NOT unknown pipes, so every pipe the templates format with has to stay
      set: { imports: [TranslatePipe, ConvertTempPipe, DecimalPipe, LowerCasePipe, UpperCasePipe], schemas: [NO_ERRORS_SCHEMA] },
    })

    const fixture = TestBed.createComponent(type as any)
    fixture.componentRef.setInput('service', service)
    fixture.detectChanges()
    return fixture.componentInstance as T
  }

  describe('the HAP air quality tile', () => {
    function sensor(values: Record<string, number> = {}) {
      return hapService({
        type: 'AirQualitySensor',
        characteristics: Object.entries({ AirQuality: 2, ...values }).map(([name, value]) => characteristic(name, value)) as any,
      })
    }

    it.each([
      ['fine particulates', 'PM2_5Density'],
      ['coarse particulates', 'PM10Density'],
      ['ozone', 'OzoneDensity'],
      ['nitrogen dioxide', 'NitrogenDioxideDensity'],
      ['sulphur dioxide', 'SulphurDioxideDensity'],
      ['volatile compounds', 'VOCDensity'],
    ])('offers its modal when the sensor reports %s', (_label, field) => {
      const component = create(AirQualitySensorComponent, sensor({ [field]: 12 }))

      expect(component.canShowModal()).toBe(true)
    })

    it('offers nothing to open when there is only an overall rating', () => {
      // The modal exists to show the individual readings; with none it would be
      // an empty panel
      const component = create(AirQualitySensorComponent, sensor())

      expect(component.canShowModal()).toBe(false)
    })

    it('counts a reading of zero as a reading', () => {
      // Zero particulates is a real measurement, and a good one
      const component = create(AirQualitySensorComponent, sensor({ PM2_5Density: 0 }))

      expect(component.canShowModal()).toBe(true)
    })

    it('opens the modal on a long press', () => {
      const component = create(AirQualitySensorComponent, sensor({ PM2_5Density: 12 }))

      component.onLongClick()

      expect(modal.opened).toHaveLength(1)
      expect(modal.lastOpened()!.options?.backdrop).toBe('static')
    })

    it('opens nothing when there is nothing to show', () => {
      const component = create(AirQualitySensorComponent, sensor())

      component.onLongClick()

      expect(modal.opened).toEqual([])
    })

    it('has a label for every rating HAP defines', () => {
      const component = create(AirQualitySensorComponent, sensor())

      // 0 unknown through 5 poor
      expect(component.labels).toHaveLength(6)
    })
  })

  describe('the matter air quality tile', () => {
    function sensor(clusters: Record<string, Record<string, unknown>> = {}) {
      return matterService({
        deviceType: 'AirQualitySensor',
        clusters: { airQuality: { airQuality: 2 }, ...clusters },
      })
    }

    it('offers its modal when the sensor reports a concentration', () => {
      const component = create(MatterAirQualitySensorComponent, sensor({
        pm25ConcentrationMeasurement: { measuredValue: 12 },
      }))

      expect(component.canShowModal()).toBe(true)
    })

    it('offers nothing to open when there is only an overall rating', () => {
      const component = create(MatterAirQualitySensorComponent, sensor())

      expect(component.canShowModal()).toBe(false)
    })

    it('opens the modal on a long press', () => {
      const component = create(MatterAirQualitySensorComponent, sensor({
        pm25ConcentrationMeasurement: { measuredValue: 12 },
      }))

      component.onLongClick()

      expect(modal.opened).toHaveLength(1)
    })

    it('opens nothing when there is nothing to show', () => {
      const component = create(MatterAirQualitySensorComponent, sensor())

      component.onLongClick()

      expect(modal.opened).toEqual([])
    })
  })

  describe('the matter smoke and carbon monoxide alarm', () => {
    /**
     * One alarm accessory. Which alarms it has is decided by which state
     * attributes the cluster carries, not by the device type.
     * @param options - which alarms the device reports
     * @param options.smoke - the smoke alarm state, if it has one
     * @param options.co - the carbon monoxide alarm state, if it has one
     */
    function alarm(options: { smoke?: number, co?: number } = {}) {
      const cluster: Record<string, unknown> = {}
      if (options.smoke !== undefined) {
        cluster.smokeState = options.smoke
      }
      if (options.co !== undefined) {
        cluster.coState = options.co
      }
      return matterService({ deviceType: 'SmokeCoAlarm', clusters: { smokeCoAlarm: cluster } })
    }

    it('calls a smoke-only device a smoke alarm', () => {
      const component = create(MatterSmokeCoAlarmComponent, alarm({ smoke: 0 }))

      expect(component.alarmKind()).toBe('smoke')
      expect(component.typeKey()).toBe('accessories.core.smoke_sensor')
    })

    it('calls a carbon-monoxide-only device a CO alarm', () => {
      // A plugin can register either alarm on its own, and calling a CO detector
      // a smoke alarm would be actively misleading
      const component = create(MatterSmokeCoAlarmComponent, alarm({ co: 0 }))

      expect(component.alarmKind()).toBe('co')
      expect(component.typeKey()).toBe('accessories.core.carbon_monoxide_sensor')
    })

    it('keeps the generic face for a device with both', () => {
      const component = create(MatterSmokeCoAlarmComponent, alarm({ smoke: 0, co: 0 }))

      expect(component.alarmKind()).toBe('both')
    })

    it('labels a combined alarm as smoke rather than leaving it blank', () => {
      const component = create(MatterSmokeCoAlarmComponent, alarm({ smoke: 0, co: 0 }))

      expect(component.typeKey()).toBe('accessories.core.smoke_sensor')
    })

    it('falls back to smoke for a device claiming neither', () => {
      // Matter requires at least one, so this device is malformed - it arrived
      // under the SmokeSensor device type, so treat it as one
      const component = create(MatterSmokeCoAlarmComponent, alarm())

      expect(component.alarmKind()).toBe('smoke')
    })

    it('shows an alarm that is sounding as triggered', () => {
      const component = create(MatterSmokeCoAlarmComponent, alarm({ smoke: 1 }))

      expect(component.isTriggered()).toBe(true)
    })

    it('shows a quiet alarm as not triggered', () => {
      const component = create(MatterSmokeCoAlarmComponent, alarm({ smoke: 0 }))

      expect(component.isTriggered()).toBe(false)
    })
  })

  describe('the temperature tiles', () => {
    it('takes the unit from the user settings on a HAP sensor', () => {
      const service = hapService({
        type: 'TemperatureSensor',
        characteristics: [characteristic('CurrentTemperature', 20.5)],
      })

      expect(create(TemperatureSensorComponent, service, 'f').temperatureUnits).toBe('f')
      expect(create(TemperatureSensorComponent, service, 'c').temperatureUnits).toBe('c')
    })

    it('takes the unit from the user settings on a matter sensor', () => {
      const service = matterService({
        deviceType: 'TemperatureSensor',
        clusters: { temperatureMeasurement: { measuredValue: 2050 } },
      })

      expect(create(MatterTemperatureSensorComponent, service, 'f').temperatureUnits).toBe('f')
    })

    it('reads a matter temperature out of hundredths of a degree', () => {
      const service = matterService({
        deviceType: 'TemperatureSensor',
        clusters: { temperatureMeasurement: { measuredValue: 2050 } },
      })

      expect(create(MatterTemperatureSensorComponent, service).temperature()).toBe(20.5)
    })
  })
})
