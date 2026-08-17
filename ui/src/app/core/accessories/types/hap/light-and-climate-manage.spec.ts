import type { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import type { AccessoriesService } from '@/app/core/accessories/accessories.service'
import type { FakeSettings, FakeToastr } from '@/testing'
import type { CharacteristicType } from '@homebridge/hap-client'

import { DecimalPipe, UpperCasePipe } from '@angular/common'
import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'
import { Subject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ACCESSORY_MANAGE_MODAL_DATA } from '@/app/core/accessories/types/base-manage.component'
import { AirPurifierManageComponent } from '@/app/core/accessories/types/hap/air-purifier/air-purifier.manage.component'
import { HeaterCoolerManageComponent } from '@/app/core/accessories/types/hap/heater-cooler/heater-cooler.manage.component'
import { HumidifierDehumidifierManageComponent } from '@/app/core/accessories/types/hap/humidifier-dehumidifier/humidifier-dehumidifier.manage.component'
import { LightbulbManageComponent } from '@/app/core/accessories/types/hap/lightbulb/lightbulb.manage.component'
import { ThermostatManageComponent } from '@/app/core/accessories/types/hap/thermostat/thermostat.manage.component'
import { ConvertMiredPipe } from '@/app/core/pipes/convert-mired.pipe'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { activeModalStub, characteristic, hapService, makeSettings, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The two most involved HAP manage modals.
 *
 * HAP control is characteristic-based rather than cluster-based, so the risk is
 * the mirror image of the matter modals: writing the right value to the wrong
 * characteristic name. A wrong name resolves to `null` from
 * `getCharacteristic`, which throws inside a debounce callback where nothing
 * catches it - the slider simply stops working.
 *
 * The debounce is the base class default of 500ms in both.
 */
describe('HAP light and climate manage modals', () => {
  let toastr: FakeToastr
  let settings: FakeSettings
  let activeModal: NgbActiveModal
  let service: ServiceTypeX
  let accessoryData: Subject<unknown>

  function accessoriesStub(current: ServiceTypeX) {
    accessoryData = new Subject()
    return {
      accessoryData,
      accessories: { services: [current] },
    } as unknown as AccessoriesService
  }

  /**
   * Build a manage modal for a given service.
   *
   * ⚠️ NouisliderComponent and FormsModule both come out: the sliders carry
   * `[(ngModel)]`, and leaving NgModel active with the slider element unknown
   * fails with NG01203 (no value accessor). Pipes stay - an unknown pipe is a
   * hard error even under NO_ERRORS_SCHEMA.
   */
  function create<T>(type: new (...args: any[]) => T, target: ServiceTypeX, overrides: { temperatureUnits?: 'c' | 'f' } = {}) {
    TestBed.resetTestingModule()

    service = target
    toastr = toastrStub()
    settings = makeSettings({ env: { temperatureUnits: overrides.temperatureUnits ?? 'c' } })
    activeModal = activeModalStub()

    TestBed.configureTestingModule({
      imports: [type as any],
      providers: [
        provideTestTranslate(),
        provideFakes({ toastr, settings }),
        { provide: NgbActiveModal, useValue: activeModal },
        {
          provide: ACCESSORY_MANAGE_MODAL_DATA,
          useValue: { service, $accessories: accessoriesStub(service) },
        },
      ],
    })

    TestBed.overrideComponent(type as any, {
      set: {
        imports: [TranslatePipe, ConvertMiredPipe, ConvertTempPipe, DecimalPipe, UpperCasePipe],
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

  /**
   * Every `setValue` call made on a service, as characteristic → value pairs,
   * in the order they actually happened.
   *
   * ⚠️ Sorted by `invocationCallOrder`, not by characteristic. Collecting them
   * per characteristic returns them in declaration order, which silently made
   * an "On written after Brightness" assertion pass or fail depending on how
   * the fixture happened to list them.
   */
  function writesTo(target: ServiceTypeX) {
    return target.serviceCharacteristics
      .flatMap((char) => {
        const spy = vi.mocked(char.setValue!)
        return spy.mock.calls.map((call, index) => ({
          type: char.type,
          value: call[0],
          order: spy.mock.invocationCallOrder[index],
        }))
      })
      .sort((first, second) => first.order - second.order)
      .map(({ type, value }) => ({ type, value }))
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

  describe('lightbulb', () => {
    /** A full-colour bulb: on/off, brightness, hue, saturation, colour temperature. */
    function colourBulb(values: { on?: boolean, brightness?: number, hue?: number, saturation?: number, mired?: number } = {}) {
      return hapService({
        type: 'Lightbulb',
        serviceName: 'Test Bulb',
        characteristics: [
          characteristic('On', values.on ?? true),
          characteristic('Brightness', values.brightness ?? 60, { minValue: 0, maxValue: 100, minStep: 1 }),
          characteristic('Hue', values.hue ?? 120, { minValue: 0, maxValue: 360, minStep: 1 }),
          characteristic('Saturation', values.saturation ?? 80, { minValue: 0, maxValue: 100, minStep: 1 }),
          characteristic('ColorTemperature', values.mired ?? 250, { minValue: 140, maxValue: 500, minStep: 1 }),
        ],
      })
    }

    /** A plain white bulb with nothing but on/off. */
    function plainBulb() {
      return hapService({
        type: 'Lightbulb',
        serviceName: 'Plain Bulb',
        characteristics: [characteristic('On', false)],
      })
    }

    it('reads the sliders from the characteristics rather than assuming a range', () => {
      // Plugins declare their own ranges; a bulb reporting 0-254 brightness
      // must not be driven as though it were 0-100
      const bulb = hapService({
        type: 'Lightbulb',
        characteristics: [
          characteristic('On', true),
          characteristic('Brightness', 200, { minValue: 0, maxValue: 254, minStep: 2 }),
        ],
      })
      const component = create(LightbulbManageComponent, bulb)

      expect(component.targetBrightness).toEqual({ value: 200, min: 0, max: 254, step: 2 })
    })

    it('leaves the optional sliders undefined on a bulb that has none', () => {
      const component = create(LightbulbManageComponent, plainBulb())

      expect(component.targetBrightness).toBeUndefined()
      expect(component.targetHue).toBeUndefined()
      expect(component.targetSaturation).toBeUndefined()
      expect(component.targetColorTemperature).toBeUndefined()
      expect(component.targetMode).toBe(false)
    })

    it('writes a brightness change to Brightness', async () => {
      const bulb = colourBulb()
      const component = create(LightbulbManageComponent, bulb)

      await slide(() => {
        component.targetBrightness.value = 30
        component.onBrightnessStateChange()
      })

      expect(writesTo(bulb)).toEqual([{ type: 'Brightness', value: 30 }])
    })

    it('turns the bulb on when the slider is raised off zero', async () => {
      // Otherwise dragging the brightness up on an off bulb changes nothing
      const bulb = colourBulb({ on: false, brightness: 0 })
      const component = create(LightbulbManageComponent, bulb)

      await slide(() => {
        component.targetBrightness.value = 40
        component.onBrightnessStateChange()
      })

      expect(writesTo(bulb)).toEqual([
        { type: 'Brightness', value: 40 },
        { type: 'On', value: true },
      ])
      expect(component.targetMode).toBe(true)
    })

    it('turns the bulb off when the slider is dragged to zero', async () => {
      const bulb = colourBulb({ on: true, brightness: 60 })
      const component = create(LightbulbManageComponent, bulb)

      await slide(() => {
        component.targetBrightness.value = 0
        component.onBrightnessStateChange()
      })

      expect(writesTo(bulb)).toEqual([
        { type: 'Brightness', value: 0 },
        { type: 'On', value: false },
      ])
      expect(component.targetMode).toBe(false)
    })

    it('does not touch On when the bulb is already in the right state', async () => {
      const bulb = colourBulb({ on: true, brightness: 60 })
      const component = create(LightbulbManageComponent, bulb)

      await slide(() => {
        component.targetBrightness.value = 90
        component.onBrightnessStateChange()
      })

      expect(writesTo(bulb).filter(write => write.type === 'On')).toEqual([])
    })

    it('writes hue and saturation to their own characteristics, separately', async () => {
      // HAP takes them one at a time, unlike the matter colorControl cluster
      const bulb = colourBulb()
      const component = create(LightbulbManageComponent, bulb)

      await slide(() => {
        component.targetHue.value = 200
        component.onHueStateChange()
        component.targetSaturation.value = 50
        component.onSaturationStateChange()
      })

      expect(writesTo(bulb)).toEqual([
        { type: 'Hue', value: 200 },
        { type: 'Saturation', value: 50 },
      ])
    })

    it('writes mireds to ColorTemperature, not the kelvin the slider shows', async () => {
      const bulb = colourBulb()
      const component = create(LightbulbManageComponent, bulb)

      await slide(() => {
        component.targetColorTemperature.value = 2500
        component.onColorTemperatureStateChange()
      })

      expect(writesTo(bulb)).toEqual([{ type: 'ColorTemperature', value: 400 }])
    })

    it('inverts the colour temperature range, because mired and kelvin run opposite ways', () => {
      const component = create(LightbulbManageComponent, colourBulb())

      // The characteristic's 140-500 mired range, read as kelvin
      expect(component.targetColorTemperature.min).toBe(2000)
      expect(component.targetColorTemperature.max).toBe(7143)
      expect(component.targetColorTemperature.value).toBe(4000)
      expect(component.targetColorTemperature.mired).toBe(250)
    })

    it('writes On when the switch is pressed', () => {
      const bulb = colourBulb({ on: false })
      const component = create(LightbulbManageComponent, bulb)

      component.setTargetMode(true, mouseEvent())

      expect(writesTo(bulb)).toEqual([{ type: 'On', value: true }])
    })

    it('moves the slider to full when switching on a bulb sitting at zero', () => {
      // Only the local slider moves - the brightness itself is left to the
      // accessory, which restores whatever level it remembers
      const bulb = colourBulb({ on: false, brightness: 0 })
      const component = create(LightbulbManageComponent, bulb)

      component.setTargetMode(true, mouseEvent())

      expect(component.targetBrightness.value).toBe(100)
      expect(writesTo(bulb)).toEqual([{ type: 'On', value: true }])
    })

    it('follows a change made elsewhere', () => {
      const bulb = colourBulb()
      const component = create(LightbulbManageComponent, bulb)

      const updated = colourBulb({ on: false, brightness: 10, hue: 300, saturation: 20, mired: 500 })
      component.$accessories.accessories.services[0] = updated
      accessoryData.next([updated])

      expect(component.targetMode).toBe(false)
      expect(component.targetBrightness.value).toBe(10)
      expect(component.targetHue.value).toBe(300)
      expect(component.targetSaturation.value).toBe(20)
      expect(component.targetColorTemperature.mired).toBe(500)
      expect(component.targetColorTemperature.value).toBe(2000)
    })

    it('reports no adaptive lighting when the opener did not provide it', () => {
      // The token has a factory returning undefined, so a bulb opened outside
      // the accessories page must not claim the feature
      const component = create(LightbulbManageComponent, colourBulb())

      expect(component.hasAdaptiveLighting).toBe(false)
      expect(component.adaptiveLightingSignal).toBeUndefined()
    })
  })

  describe('heater cooler', () => {
    /** A heater cooler, optionally with a fan folded in from the same accessory. */
    function heaterCooler(options: {
      active?: number
      mode?: number
      validValues?: number[]
      heating?: number
      cooling?: number
      currentState?: number
      fanSpeed?: number
    } = {}) {
      const characteristics: CharacteristicType[] = [
        characteristic('Active', options.active ?? 1),
        characteristic('CurrentHeaterCoolerState', options.currentState ?? 2),
        characteristic('TargetHeaterCoolerState', options.mode ?? 0, { validValues: options.validValues ?? [0, 1, 2] }),
        characteristic('HeatingThresholdTemperature', options.heating ?? 18, { minValue: 10, maxValue: 25, minStep: 0.5 }),
        characteristic('CoolingThresholdTemperature', options.cooling ?? 24, { minValue: 18, maxValue: 35, minStep: 0.5 }),
      ]

      const unit = hapService({ type: 'HeaterCooler', serviceName: 'Aircon', characteristics })

      if (options.fanSpeed !== undefined) {
        const fan = hapService({
          type: 'Fanv2',
          serviceName: 'Aircon',
          uniqueId: 'hap-fan',
          characteristics: [characteristic('RotationSpeed', options.fanSpeed, { minValue: 0, maxValue: 100, minStep: 25, unit: 'percentage' })],
        })
        unit.linkedServices = { 11: fan as any }
      }

      return unit
    }

    it('reads the two setpoints and the mode', () => {
      const component = create(HeaterCoolerManageComponent, heaterCooler())

      expect(component.targetState).toBe(1)
      expect(component.targetMode).toBe(0)
      expect(component.targetHeatingTemp).toBe(18)
      expect(component.targetCoolingTemp).toBe(24)
      expect(component.autoTemp).toEqual([18, 24])
    })

    it('treats a unit that cannot cool as a heater', () => {
      const component = create(HeaterCoolerManageComponent, heaterCooler({ validValues: [0, 1] }))

      expect(component.type).toBe('heater')
    })

    it('treats a unit that cannot heat as a cooler', () => {
      const component = create(HeaterCoolerManageComponent, heaterCooler({ validValues: [0, 2] }))

      expect(component.type).toBe('cooler')
    })

    it('leaves the type unset on a unit that can do both', () => {
      // The template then offers all three mode buttons
      const component = create(HeaterCoolerManageComponent, heaterCooler({ validValues: [0, 1, 2] }))

      expect(component.type).toBeUndefined()
      expect(component.targetStateValidValues).toEqual([0, 1, 2])
    })

    it('writes both setpoints together, because auto mode needs the pair', async () => {
      const unit = heaterCooler()
      const component = create(HeaterCoolerManageComponent, unit)

      await slide(() => {
        component.autoTemp = [20, 26]
        component.onAutoTemperatureStateChange()
      })

      expect(writesTo(unit)).toEqual([
        { type: 'HeatingThresholdTemperature', value: 20 },
        { type: 'CoolingThresholdTemperature', value: 26 },
      ])
    })

    it('keeps the paired range in step with a single setpoint change', async () => {
      const unit = heaterCooler()
      const component = create(HeaterCoolerManageComponent, unit)

      await slide(() => {
        component.targetCoolingTemp = 30
        component.onTemperatureStateChange()
      })

      expect(component.autoTemp).toEqual([18, 30])
      expect(writesTo(unit)).toEqual([
        { type: 'HeatingThresholdTemperature', value: 18 },
        { type: 'CoolingThresholdTemperature', value: 30 },
      ])
    })

    it('writes Active when the unit is switched off', () => {
      const unit = heaterCooler()
      const component = create(HeaterCoolerManageComponent, unit)

      component.setTargetState(0, mouseEvent())

      expect(writesTo(unit)).toEqual([{ type: 'Active', value: 0 }])
      expect(component.targetState).toBe(0)
    })

    it('writes TargetHeaterCoolerState when the mode is changed', () => {
      const unit = heaterCooler()
      const component = create(HeaterCoolerManageComponent, unit)

      component.setTargetMode(2, mouseEvent())

      expect(writesTo(unit)).toEqual([{ type: 'TargetHeaterCoolerState', value: 2 }])
      expect(component.targetMode).toBe(2)
    })

    it('picks up the fan folded in from the same physical accessory', () => {
      const component = create(HeaterCoolerManageComponent, heaterCooler({ fanSpeed: 50 }))

      expect(component.serviceFan).toBeDefined()
      expect(component.targetRotationSpeed).toEqual({
        value: 50,
        min: 0,
        max: 100,
        step: 25,
        unit: 'percentage',
      })
    })

    it('writes the fan speed to the fan service, not to the unit', async () => {
      // The two are separate HAP services; writing RotationSpeed on the
      // heater cooler would resolve to null and throw
      const unit = heaterCooler({ fanSpeed: 50 })
      const fan = Object.values(unit.linkedServices!)[0] as unknown as ServiceTypeX
      const component = create(HeaterCoolerManageComponent, unit)

      await slide(() => {
        component.targetRotationSpeed.value = 75
        component.onTargetRotationSpeedChange()
      })

      expect(writesTo(fan)).toEqual([{ type: 'RotationSpeed', value: 75 }])
      expect(writesTo(unit)).toEqual([])
    })

    it('offers no fan slider on a unit without one', () => {
      const component = create(HeaterCoolerManageComponent, heaterCooler())

      expect(component.serviceFan).toBeUndefined()
      expect(component.targetRotationSpeed).toBeUndefined()
    })

    it('ignores a linked service that is not a fan', () => {
      const unit = heaterCooler()
      unit.linkedServices = { 12: hapService({ type: 'TemperatureSensor', uniqueId: 'hap-temp' }) as any }
      const component = create(HeaterCoolerManageComponent, unit)

      expect(component.serviceFan).toBeUndefined()
    })

    describe('the status colour', () => {
      it.each([
        ['status-color-cooling', { active: 1, currentState: 3 }],
        ['status-color-heating', { active: 1, currentState: 2 }],
        ['status-color-active', { active: 1, currentState: 1 }],
        ['status-color-inactive', { active: 0, currentState: 0 }],
      ])('is %s', (expected, options) => {
        const component = create(HeaterCoolerManageComponent, heaterCooler(options))

        expect(component.getStatusClass()).toBe(expected)
      })

      it('shows a cool-only unit as cooling whenever it is running', () => {
        // Such a unit never reports CurrentHeaterCoolerState 3
        const component = create(HeaterCoolerManageComponent, heaterCooler({ active: 1, currentState: 1, validValues: [0, 2] }))

        expect(component.getStatusClass()).toBe('status-color-cooling')
      })

      it('shows a heat-only unit as heating whenever it is running', () => {
        const component = create(HeaterCoolerManageComponent, heaterCooler({ active: 1, currentState: 1, validValues: [0, 1] }))

        expect(component.getStatusClass()).toBe('status-color-heating')
      })
    })

    it('takes the temperature unit from the user settings', () => {
      const component = create(HeaterCoolerManageComponent, heaterCooler(), { temperatureUnits: 'f' })

      expect(component.temperatureUnits).toBe('f')
    })

    it('follows a change made elsewhere, fan speed included', () => {
      const component = create(HeaterCoolerManageComponent, heaterCooler({ fanSpeed: 50 }))

      const updated = heaterCooler({ active: 0, mode: 2, heating: 15, cooling: 30, fanSpeed: 100 })
      component.$accessories.accessories.services[0] = updated
      component.serviceFan = Object.values(updated.linkedServices!)[0]
      accessoryData.next([updated])

      expect(component.targetState).toBe(0)
      expect(component.targetMode).toBe(2)
      expect(component.autoTemp).toEqual([15, 30])
      expect(component.targetRotationSpeed.value).toBe(100)
    })
  })

  describe('thermostat', () => {
    /** A dual-mode thermostat with both a setpoint and the auto thresholds. */
    function thermostat(options: {
      mode?: number
      currentState?: number
      target?: number
      heating?: number
      cooling?: number
      validValues?: number[]
      humidity?: boolean
    } = {}) {
      const characteristics: CharacteristicType[] = [
        characteristic('CurrentHeatingCoolingState', options.currentState ?? 0),
        characteristic('TargetHeatingCoolingState', options.mode ?? 1, { validValues: options.validValues ?? [0, 1, 2, 3] }),
        characteristic('TargetTemperature', options.target ?? 21, { minValue: 10, maxValue: 38, minStep: 0.5 }),
        characteristic('HeatingThresholdTemperature', options.heating ?? 18, { minValue: 0, maxValue: 25, minStep: 0.5 }),
        characteristic('CoolingThresholdTemperature', options.cooling ?? 24, { minValue: 10, maxValue: 35, minStep: 0.5 }),
      ]
      if (options.humidity) {
        characteristics.push(characteristic('CurrentRelativeHumidity', 45))
      }
      return hapService({ type: 'Thermostat', serviceName: 'Hallway', characteristics })
    }

    it('reads the setpoint and both thresholds', () => {
      const component = create(ThermostatManageComponent, thermostat())

      expect(component.targetMode).toBe(1)
      expect(component.targetTemperature).toEqual({ value: 21, min: 10, max: 38, step: 0.5 })
      expect(component.autoTemp).toEqual([18, 24])
    })

    it('falls back to half a degree when the accessory declares no step', () => {
      // A step of zero would make the slider unusable
      const service = hapService({
        type: 'Thermostat',
        characteristics: [
          characteristic('TargetHeatingCoolingState', 1, { validValues: [0, 1] }),
          characteristic('TargetTemperature', 21, { minValue: 10, maxValue: 38, minStep: 0 }),
        ],
      })
      const component = create(ThermostatManageComponent, service)

      expect(component.targetTemperature.step).toBe(0.5)
    })

    it('writes the single setpoint to TargetTemperature', async () => {
      // Not to a threshold - those are only used in auto mode
      const service = thermostat()
      const component = create(ThermostatManageComponent, service)

      await slide(() => {
        component.targetTemperature.value = 23
        component.onTemperatureStateChange()
      })

      expect(writesTo(service)).toEqual([{ type: 'TargetTemperature', value: 23 }])
    })

    it('writes both thresholds together in auto mode', async () => {
      const service = thermostat({ mode: 3 })
      const component = create(ThermostatManageComponent, service)

      await slide(() => {
        component.autoTemp = [19, 26]
        component.onAutoThresholdStateChange()
      })

      expect(writesTo(service)).toEqual([
        { type: 'HeatingThresholdTemperature', value: 19 },
        { type: 'CoolingThresholdTemperature', value: 26 },
      ])
    })

    it('keeps the paired range in step with a single threshold change', async () => {
      const service = thermostat({ mode: 3 })
      const component = create(ThermostatManageComponent, service)

      await slide(() => {
        component.targetHeatingTemp = 20
        component.onThresholdStateChange()
      })

      expect(component.autoTemp).toEqual([20, 24])
    })

    it('writes the mode to TargetHeatingCoolingState', () => {
      const service = thermostat()
      const component = create(ThermostatManageComponent, service)

      component.setTargetMode(2, mouseEvent())

      expect(writesTo(service)).toEqual([{ type: 'TargetHeatingCoolingState', value: 2 }])
    })

    it('shows the humidity reading only when the accessory reports one', () => {
      expect(create(ThermostatManageComponent, thermostat({ humidity: true })).hasHumidity).toBe(true)
      expect(create(ThermostatManageComponent, thermostat()).hasHumidity).toBe(false)
    })

    it('offers only the modes the accessory supports', () => {
      const component = create(ThermostatManageComponent, thermostat({ validValues: [0, 1] }))

      expect(component.targetStateValidValues).toEqual([0, 1])
    })

    describe('the status colour', () => {
      it.each([
        ['status-color-cooling', { currentState: 2 }],
        ['status-color-heating', { currentState: 1 }],
        ['status-color-inactive', { currentState: 0, mode: 0 }],
      ])('is %s from what it is currently doing', (expected, options) => {
        const component = create(ThermostatManageComponent, thermostat(options))

        expect(component.getStatusClass()).toBe(expected)
      })

      it('shows an idle thermostat in auto mode as active rather than off', () => {
        // It is waiting rather than switched off, and the two look different
        const component = create(ThermostatManageComponent, thermostat({ currentState: 0, mode: 3 }))

        expect(component.getStatusClass()).toBe('status-color-active')
      })
    })

    it('takes the temperature unit from the user settings', () => {
      const component = create(ThermostatManageComponent, thermostat(), { temperatureUnits: 'f' })

      expect(component.temperatureUnits).toBe('f')
    })

    it('follows a change made elsewhere', () => {
      const component = create(ThermostatManageComponent, thermostat())

      const updated = thermostat({ mode: 3, target: 25, heating: 15, cooling: 30 })
      component.$accessories.accessories.services[0] = updated
      accessoryData.next([updated])

      expect(component.targetMode).toBe(3)
      expect(component.targetTemperature.value).toBe(25)
      expect(component.autoTemp).toEqual([15, 30])
    })
  })

  describe('humidifier dehumidifier', () => {
    function unit(options: {
      active?: number
      mode?: number
      validValues?: number[]
      humidify?: number
      dehumidify?: number
      fanSpeed?: number
    } = {}) {
      const characteristics: CharacteristicType[] = [
        characteristic('Active', options.active ?? 1),
        characteristic('TargetHumidifierDehumidifierState', options.mode ?? 0, { validValues: options.validValues ?? [0, 1, 2] }),
        characteristic('RelativeHumidityHumidifierThreshold', options.humidify ?? 45, { minValue: 0, maxValue: 100, minStep: 1 }),
        characteristic('RelativeHumidityDehumidifierThreshold', options.dehumidify ?? 60, { minValue: 0, maxValue: 100, minStep: 1 }),
      ]

      const device = hapService({ type: 'HumidifierDehumidifier', serviceName: 'Bedroom', characteristics })

      if (options.fanSpeed !== undefined) {
        const fan = hapService({
          type: 'Fanv2',
          serviceName: 'Bedroom',
          uniqueId: 'hap-fan',
          characteristics: [characteristic('RotationSpeed', options.fanSpeed, { minValue: 0, maxValue: 100, minStep: 25 })],
        })
        device.linkedServices = { 11: fan as any }
      }

      return device
    }

    it('reads both thresholds and the mode', () => {
      const component = create(HumidifierDehumidifierManageComponent, unit())

      expect(component.targetState).toBe(1)
      expect(component.targetMode).toBe(0)
      expect(component.autoHumidity).toEqual([45, 60])
    })

    it('treats a unit that cannot dehumidify as a humidifier', () => {
      const component = create(HumidifierDehumidifierManageComponent, unit({ validValues: [0, 1] }))

      expect(component.type).toBe('humidifier')
    })

    it('treats a unit that cannot humidify as a dehumidifier', () => {
      const component = create(HumidifierDehumidifierManageComponent, unit({ validValues: [0, 2] }))

      expect(component.type).toBe('dehumidifier')
    })

    it('leaves the type unset on a unit that can do both', () => {
      const component = create(HumidifierDehumidifierManageComponent, unit({ validValues: [0, 1, 2] }))

      expect(component.type).toBeUndefined()
    })

    it('writes the switch to Active', () => {
      const service = unit()
      const component = create(HumidifierDehumidifierManageComponent, service)

      component.setTargetState(0, mouseEvent())

      expect(writesTo(service)).toEqual([{ type: 'Active', value: 0 }])
    })

    it('writes the mode to TargetHumidifierDehumidifierState', () => {
      const service = unit()
      const component = create(HumidifierDehumidifierManageComponent, service)

      component.setTargetMode(2, mouseEvent())

      expect(writesTo(service)).toEqual([{ type: 'TargetHumidifierDehumidifierState', value: 2 }])
    })

    it('writes each threshold to its own characteristic', async () => {
      // The two names differ by one word, and swapping them makes a humidifier
      // chase the dehumidify target
      const service = unit()
      const component = create(HumidifierDehumidifierManageComponent, service)

      await slide(() => {
        component.autoHumidity = [40, 70]
        component.onAutoHumidityStateChange()
      })

      expect(writesTo(service)).toEqual([
        { type: 'RelativeHumidityHumidifierThreshold', value: 40 },
        { type: 'RelativeHumidityDehumidifierThreshold', value: 70 },
      ])
    })

    it('writes the fan speed to the fan folded in beside it', async () => {
      const service = unit({ fanSpeed: 50 })
      const fan = Object.values(service.linkedServices!)[0] as unknown as ServiceTypeX
      const component = create(HumidifierDehumidifierManageComponent, service)

      await slide(() => {
        component.targetRotationSpeed.value = 75
        component.onTargetRotationSpeedChange()
      })

      expect(writesTo(fan)).toEqual([{ type: 'RotationSpeed', value: 75 }])
      expect(writesTo(service)).toEqual([])
    })

    it('offers no fan slider on a unit without one', () => {
      const component = create(HumidifierDehumidifierManageComponent, unit())

      expect(component.serviceFan).toBeUndefined()
      expect(component.targetRotationSpeed).toBeUndefined()
    })

    it('follows a change made elsewhere, fan speed included', () => {
      const component = create(HumidifierDehumidifierManageComponent, unit({ fanSpeed: 50 }))

      const updated = unit({ active: 0, mode: 2, humidify: 30, dehumidify: 80, fanSpeed: 100 })
      component.$accessories.accessories.services[0] = updated
      component.serviceFan = Object.values(updated.linkedServices!)[0] as any
      accessoryData.next([updated])

      expect(component.targetState).toBe(0)
      expect(component.targetMode).toBe(2)
      expect(component.autoHumidity).toEqual([30, 80])
      expect(component.targetRotationSpeed.value).toBe(100)
    })

    it('follows a change on a unit that has no fan', () => {
      // ⚠️ The fan is optional, so the update has to cope with there being none
      const component = create(HumidifierDehumidifierManageComponent, unit())

      const updated = unit({ active: 0, mode: 1 })
      component.$accessories.accessories.services[0] = updated

      expect(() => accessoryData.next([updated])).not.toThrow()
      expect(component.targetMode).toBe(1)
    })

    it('writes both thresholds when one of the pair is moved', async () => {
      // ⚠️ They are one control with two handles. Writing only the moved handle
      // leaves the other showing a value the accessory never received
      const service = unit()
      const component = create(HumidifierDehumidifierManageComponent, service)

      await slide(() => {
        component.targetHumidifierHumidity = 35
        component.onHumidityStateChange()
      })

      expect(component.autoHumidity).toEqual([35, 60])
      expect(writesTo(service)).toEqual([
        { type: 'RelativeHumidityHumidifierThreshold', value: 35 },
        { type: 'RelativeHumidityDehumidifierThreshold', value: 60 },
      ])
    })

    describe('the colour of the fan slider', () => {
      /** The gradient the fan slider is painted with. */
      function gradient(component: any): string {
        return component.getFanSliderGradient()
      }

      it('is grey while the unit is off', async () => {
        // Nothing is running, so a coloured slider would suggest it is
        const component = create(HumidifierDehumidifierManageComponent, unit({ active: 0, fanSpeed: 50 }))

        expect(gradient(component)).toContain('#c0c0c0')
      })

      it.each([
        ['humidifying', 1, '#add8e6'],
        ['dehumidifying', 2, '#ffb978'],
        ['in auto', 0, '#90ee90'],
      ])('follows the mode when %s', (_case, mode, colour) => {
        const component = create(HumidifierDehumidifierManageComponent, unit({ mode, fanSpeed: 50 }))

        expect(gradient(component)).toContain(colour)
      })
    })
  })

  describe('air purifier', () => {
    /** An air purifier reporting power as `Active`, which most do. */
    function purifier(options: { active?: number, mode?: number, speed?: number } = {}) {
      return hapService({
        type: 'AirPurifier',
        characteristics: [
          characteristic('Active', options.active ?? 1),
          characteristic('TargetAirPurifierState', options.mode ?? 1, { validValues: [0, 1] }),
          characteristic('RotationSpeed', options.speed ?? 50, { minValue: 0, maxValue: 100, minStep: 1 }),
        ],
      })
    }

    /** An air purifier exposing a plain `On` switch instead. */
    function onOffPurifier(on = true, speed = 50) {
      return hapService({
        type: 'AirPurifier',
        characteristics: [
          characteristic('On', on),
          characteristic('RotationSpeed', speed, { minValue: 0, maxValue: 100, minStep: 1 }),
        ],
      })
    }

    it('reads the power state from Active', () => {
      expect(create(AirPurifierManageComponent, purifier({ active: 1 })).targetState).toBe(1)
      expect(create(AirPurifierManageComponent, purifier({ active: 0 })).targetState).toBe(0)
    })

    it('reads the power state from On when that is all there is', () => {
      expect(create(AirPurifierManageComponent, onOffPurifier(true)).targetState).toBe(1)
      expect(create(AirPurifierManageComponent, onOffPurifier(false)).targetState).toBe(0)
    })

    it('writes a number to Active', () => {
      const service = purifier({ active: 0 })
      const component = create(AirPurifierManageComponent, service)

      component.setTargetState(1, mouseEvent())

      expect(writesTo(service)).toEqual([{ type: 'Active', value: 1 }])
    })

    it('writes a boolean to On when that is all there is', () => {
      const service = onOffPurifier(false)
      const component = create(AirPurifierManageComponent, service)

      component.setTargetState(1, mouseEvent())

      expect(writesTo(service)).toEqual([{ type: 'On', value: true }])
    })

    it('writes the auto or manual choice to TargetAirPurifierState', () => {
      const service = purifier()
      const component = create(AirPurifierManageComponent, service)

      component.setTargetMode(0, mouseEvent())

      expect(writesTo(service)).toEqual([{ type: 'TargetAirPurifierState', value: 0 }])
    })

    it('switches the purifier on when the speed is raised off zero', async () => {
      const service = purifier({ active: 0, speed: 0 })
      const component = create(AirPurifierManageComponent, service)

      await slide(() => {
        component.targetRotationSpeed.value = 40
        component.onTargetRotationSpeedChange()
      })

      expect(writesTo(service)).toEqual([
        { type: 'RotationSpeed', value: 40 },
        { type: 'Active', value: 1 },
      ])
    })

    it('switches the purifier off when the speed is dragged to zero', async () => {
      const service = purifier({ active: 1, speed: 50 })
      const component = create(AirPurifierManageComponent, service)

      await slide(() => {
        component.targetRotationSpeed.value = 0
        component.onTargetRotationSpeedChange()
      })

      expect(writesTo(service)).toEqual([
        { type: 'RotationSpeed', value: 0 },
        { type: 'Active', value: 0 },
      ])
    })

    it('offers only the modes the accessory supports', () => {
      const component = create(AirPurifierManageComponent, purifier())

      expect(component.targetModeValidValues).toEqual([0, 1])
    })

    it('switches an on-off purifier on with a boolean when the speed is raised', async () => {
      // ⚠️ The two cases above go through the `Active` arm. A purifier with only
      // an `On` switch takes the arm beside it, and a number written there is
      // refused by HAP - the speed moves and the purifier stays off
      const service = onOffPurifier(false, 0)
      const component = create(AirPurifierManageComponent, service)

      await slide(() => {
        component.targetRotationSpeed.value = 40
        component.onTargetRotationSpeedChange()
      })

      expect(writesTo(service)).toEqual([
        { type: 'RotationSpeed', value: 40 },
        { type: 'On', value: true },
      ])
    })

    it('switches an on-off purifier off with a boolean when the speed reaches zero', async () => {
      const service = onOffPurifier(true, 50)
      const component = create(AirPurifierManageComponent, service)

      await slide(() => {
        component.targetRotationSpeed.value = 0
        component.onTargetRotationSpeedChange()
      })

      expect(writesTo(service)).toEqual([
        { type: 'RotationSpeed', value: 0 },
        { type: 'On', value: false },
      ])
    })

    it.each([
      ['one reporting Active', () => purifier({ active: 1, speed: 50 }), () => purifier({ active: 0, mode: 0, speed: 20 }), 0],
      ['one reporting On', () => onOffPurifier(true, 50), () => onOffPurifier(false, 20), 0],
    ])('follows a change made elsewhere on %s', (_case, initial, changed, expectedState) => {
      const component = create(AirPurifierManageComponent, initial())

      const updated = changed()
      component.$accessories.accessories.services[0] = updated
      accessoryData.next([updated])

      expect(component.targetState).toBe(expectedState)
      expect(component.targetRotationSpeed.value).toBe(20)
    })

    it('offers no mode buttons to a purifier with no auto mode', () => {
      const component = create(AirPurifierManageComponent, onOffPurifier())

      expect(component.targetModeValidValues).toEqual([])
    })
  })
})
