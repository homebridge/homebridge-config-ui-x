import type { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import type { AccessoriesService } from '@/app/core/accessories/accessories.service'
import type { FakeToastr } from '@/testing'
import type { CharacteristicType } from '@homebridge/hap-client'

import { DecimalPipe, UpperCasePipe } from '@angular/common'
import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'
import { Subject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ACCESSORY_MANAGE_MODAL_DATA } from '@/app/core/accessories/types/base-manage.component'
import { HapAirQualitySensorManageComponent } from '@/app/core/accessories/types/hap/air-quality-sensor/air-quality-sensor.manage.component'
import { FilterMaintenanceManageComponent } from '@/app/core/accessories/types/hap/filter-maintenance/filter-maintenance.manage.component'
import { GarageDoorOpenerManageComponent } from '@/app/core/accessories/types/hap/garage-door-opener/garage-door-opener.manage.component'
import { SecuritySystemManageComponent } from '@/app/core/accessories/types/hap/security-system/security-system.manage.component'
import { TelevisionManageComponent } from '@/app/core/accessories/types/hap/television/television.manage.component'
import { activeModalStub, characteristic, hapService, makeSettings, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The five HAP manage modals not covered elsewhere.
 *
 * Small, but three of them carry a rule that is easy to get wrong and invisible
 * when it is:
 *
 * - the **garage door** has to remember which way it was last moving, because a
 *   stopped door reports neither direction;
 * - the **security system** has to tell arming apart from disarming, since the
 *   two look identical in the raw characteristics;
 * - the **television** builds its input list out of linked services, which is
 *   the only place in the app that reads `InputSource`.
 */
describe('the remaining HAP manage modals', () => {
  let toastr: FakeToastr
  let accessoryData: Subject<unknown>

  function accessoriesStub(current: ServiceTypeX) {
    accessoryData = new Subject()
    return {
      accessoryData,
      accessories: { services: [current] },
    } as unknown as AccessoriesService
  }

  /**
   * Build a modal, keeping the fixture so a spec can feed it a second service.
   * @param type - the modal component
   * @param service - the accessory it is opened for
   */
  function build<T>(type: new (...args: any[]) => T, service: ServiceTypeX) {
    TestBed.resetTestingModule()
    toastr = toastrStub()

    TestBed.configureTestingModule({
      imports: [type as any],
      providers: [
        provideTestTranslate(),
        provideFakes({ toastr, settings: makeSettings() }),
        { provide: NgbActiveModal, useValue: activeModalStub() },
        {
          provide: ACCESSORY_MANAGE_MODAL_DATA,
          useValue: { service, $accessories: accessoriesStub(service) },
        },
      ],
    })

    TestBed.overrideComponent(type as any, {
      set: {
        imports: [TranslatePipe, DecimalPipe, UpperCasePipe],
        schemas: [NO_ERRORS_SCHEMA],
      },
    })

    const fixture = TestBed.createComponent(type as any)
    fixture.detectChanges()
    return fixture
  }

  function create<T>(type: new (...args: any[]) => T, service: ServiceTypeX): T {
    return build(type, service).componentInstance as T
  }

  /**
   * Build a modal and expose a way to deliver a fresh service to it, the way a
   * live accessory event does. Used where the modal tracks state across updates.
   * @param type - the modal component
   * @param service - the first accessory service
   */
  function createUpdatable<T>(type: new (...args: any[]) => T, service: ServiceTypeX) {
    const fixture = build(type, service)
    const component = fixture.componentInstance as T
    return {
      component,
      /**
       * Deliver a replacement service. The base class looks the current object
       * up by uniqueId in the flat list, so the list has to be updated first.
       * @param next - the replacement, carrying the same uniqueId
       */
      update: (next: ServiceTypeX) => {
        ;(component as any).$accessories.accessories.services[0] = next
        accessoryData.next([next])
        fixture.detectChanges()
      },
    }
  }

  /** Every `setValue` call on a service, in the order they happened. */
  function writesTo(service: ServiceTypeX) {
    return service.serviceCharacteristics
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

  /** A service carrying exactly the characteristics a case names. */
  function serviceWith(type: string, chars: Array<[string, any] | [string, any, Partial<CharacteristicType>]>): ServiceTypeX {
    return hapService({
      type,
      characteristics: chars.map(([name, value, overrides]) => characteristic(name, value, overrides)) as CharacteristicType[],
    })
  }

  function mouseEvent() {
    return { target: document.createElement('button') } as unknown as MouseEvent
  }

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(console.error).mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('television', () => {
    /** A television, optionally with input sources linked beside it. */
    function television(options: { active?: number, inputs?: Array<[number, string | undefined]> } = {}) {
      const tv = serviceWith('Television', [
        ['Active', options.active ?? 1],
        ['ActiveIdentifier', 1],
      ])

      if (options.inputs) {
        tv.linkedServices = Object.fromEntries(options.inputs.map(([identifier, name], index) => [
          20 + index,
          hapService({
            type: 'InputSource',
            uniqueId: `hap-input-${identifier}`,
            characteristics: [
              characteristic('Identifier', identifier),
              ...(name === undefined ? [] : [characteristic('ConfiguredName', name)]),
            ],
          }) as any,
        ]))
      }

      return tv
    }

    it('offers the power buttons only to a television that has them', () => {
      expect(create(TelevisionManageComponent, television({ active: 1 })).hasActive).toBe(true)

      const noPower = serviceWith('Television', [['ActiveIdentifier', 1]])
      expect(create(TelevisionManageComponent, noPower).hasActive).toBe(false)
    })

    it('writes the power buttons to Active', () => {
      const service = television()
      const component = create(TelevisionManageComponent, service)

      component.setActive(0, mouseEvent())

      expect(writesTo(service)).toEqual([{ type: 'Active', value: 0 }])
    })

    it('writes an input choice to ActiveIdentifier', () => {
      // Not to Active - the two are one keystroke apart
      const service = television()
      const component = create(TelevisionManageComponent, service)

      component.setInput(3, mouseEvent())

      expect(writesTo(service)).toEqual([{ type: 'ActiveIdentifier', value: 3 }])
    })

    it('builds the input list from the linked input sources', () => {
      const component = create(TelevisionManageComponent, television({
        inputs: [[1, 'HDMI 1'], [2, 'Apple TV']],
      }))

      expect(component.sourceList).toEqual([
        { identifier: 1, name: 'HDMI 1' },
        { identifier: 2, name: 'Apple TV' },
      ])
    })

    it('names an unnamed input after its number', () => {
      // Rather than showing a blank row the user cannot identify
      const component = create(TelevisionManageComponent, television({ inputs: [[4, undefined]] }))

      expect(component.sourceList).toEqual([{ identifier: 4, name: 'Input 4' }])
    })

    it('offers no input list on a television with none linked', () => {
      const component = create(TelevisionManageComponent, television())

      expect(component.sourceList).toEqual([])
    })

    it('ignores a linked service that is not an input source', () => {
      const tv = television()
      tv.linkedServices = { 20: hapService({ type: 'TelevisionSpeaker', uniqueId: 'hap-speaker' }) as any }
      const component = create(TelevisionManageComponent, tv)

      expect(component.sourceList).toEqual([])
    })
  })

  describe('garage door opener', () => {
    function garage(currentState: number) {
      return serviceWith('GarageDoorOpener', [
        ['CurrentDoorState', currentState],
        ['TargetDoorState', 1],
      ])
    }

    it.each([
      ['open', 0],
      ['closed', 1],
      ['opening', 2],
      ['closing', 3],
    ])('shows a door that is %s as it is', (_label, currentState) => {
      const component = create(GarageDoorOpenerManageComponent, garage(currentState))

      expect(component.targetState).toBe(currentState)
    })

    it('shows a door stopped while closing as heading open', () => {
      // A stopped door reports no direction, so the modal has to remember which
      // way it was going - and the button it then offers is the reverse
      const modal = createUpdatable(GarageDoorOpenerManageComponent, garage(3))

      modal.update(garage(4))

      expect(modal.component.targetState).toBe(0)
    })

    it('shows a door stopped while opening as heading closed', () => {
      const modal = createUpdatable(GarageDoorOpenerManageComponent, garage(2))

      modal.update(garage(4))

      expect(modal.component.targetState).toBe(1)
    })

    it('shows a door stopped before it ever moved as stopped', () => {
      // Nothing to reverse
      const component = create(GarageDoorOpenerManageComponent, garage(4))

      expect(component.targetState).toBe(4)
    })

    it('writes the button straight to TargetDoorState', () => {
      const service = garage(1)
      const component = create(GarageDoorOpenerManageComponent, service)

      component.setTargetState(0, mouseEvent())

      expect(writesTo(service)).toEqual([{ type: 'TargetDoorState', value: 0 }])
    })
  })

  describe('security system', () => {
    function alarm(current: number, target: number, validValues = [0, 1, 2, 3]) {
      return serviceWith('SecuritySystem', [
        ['SecuritySystemCurrentState', current],
        ['SecuritySystemTargetState', target, { validValues }],
      ])
    }

    it('reads the mode the system is heading for', () => {
      const component = create(SecuritySystemManageComponent, alarm(3, 1))

      expect(component.targetMode).toBe(1)
    })

    it('offers only the modes the system supports', () => {
      const component = create(SecuritySystemManageComponent, alarm(3, 3, [0, 3]))

      expect(component.targetModeValidValues).toEqual([0, 3])
    })

    it('writes the mode buttons to SecuritySystemTargetState', () => {
      const service = alarm(3, 3)
      const component = create(SecuritySystemManageComponent, service)

      component.setTargetMode(1, mouseEvent())

      expect(writesTo(service)).toEqual([{ type: 'SecuritySystemTargetState', value: 1 }])
      expect(component.targetMode).toBe(1)
    })

    it('shows nothing in progress once it has settled', () => {
      const component = create(SecuritySystemManageComponent, alarm(1, 1))

      expect(component.isArming).toBe(false)
      expect(component.isDisarming).toBe(false)
    })

    it('shows it arming while it moves towards an armed mode', () => {
      // Current 3 is disarmed, target 1 is armed away
      const component = create(SecuritySystemManageComponent, alarm(3, 1))

      expect(component.isArming).toBe(true)
      expect(component.isDisarming).toBe(false)
    })

    it('shows it disarming while it moves towards disarmed', () => {
      const component = create(SecuritySystemManageComponent, alarm(1, 3))

      expect(component.isDisarming).toBe(true)
      expect(component.isArming).toBe(false)
    })

    it('shows neither while a triggered alarm is being disarmed', () => {
      // Current 4 is triggered; the transition indicators would be misleading
      const component = create(SecuritySystemManageComponent, alarm(4, 3))

      expect(component.isArming).toBe(false)
      expect(component.isDisarming).toBe(false)
    })

    it('shows neither while a triggered alarm is being re-armed', () => {
      // ⚠️ Needs a target other than 3: with target 3 the `isArming` expression
      // is already false on its own, so the triggered-state guard it also
      // carries goes unexercised
      const component = create(SecuritySystemManageComponent, alarm(4, 1))

      expect(component.isArming).toBe(false)
      expect(component.isDisarming).toBe(false)
    })
  })

  describe('filter maintenance', () => {
    it('writes one to ResetFilterIndication, the only value HAP accepts', () => {
      const service = serviceWith('FilterMaintenance', [
        ['FilterChangeIndication', 1],
        ['FilterLifeLevel', 5],
        ['ResetFilterIndication', 0],
      ])
      const component = create(FilterMaintenanceManageComponent, service)

      component.resetFilterLife(mouseEvent())

      expect(writesTo(service)).toEqual([{ type: 'ResetFilterIndication', value: 1 }])
    })
  })

  describe('air quality sensor', () => {
    function sensor(values: Record<string, number> = {}) {
      return serviceWith('AirQualitySensor', Object.entries({ AirQuality: 2, ...values }))
    }

    it('reads the overall air quality', () => {
      expect(create(HapAirQualitySensorManageComponent, sensor({ AirQuality: 4 })).airQuality).toBe(4)
    })

    it('reads an unreported air quality as unknown rather than good', () => {
      const component = create(HapAirQualitySensorManageComponent, serviceWith('AirQualitySensor', [['PM2_5Density', 12]]))

      expect(component.airQuality).toBe(0)
    })

    it('reads each concentration the sensor reports', () => {
      const component = create(HapAirQualitySensorManageComponent, sensor({
        PM2_5Density: 12,
        PM10Density: 20,
        OzoneDensity: 30,
        NitrogenDioxideDensity: 5,
      }))

      expect(component.pm25).toBe(12)
      expect(component.pm10).toBe(20)
      expect(component.ozone).toBe(30)
      expect(component.no2).toBe(5)
    })

    it('leaves a concentration the sensor does not report as unknown', () => {
      // Rather than zero, which reads as a clean measurement
      const component = create(HapAirQualitySensorManageComponent, sensor())

      expect(component.pm25).toBeNull()
      expect(component.pm10).toBeNull()
      expect(component.voc).toBeNull()
    })

    it('has a label for every air quality level HAP defines', () => {
      const component = create(HapAirQualitySensorManageComponent, sensor())

      // 0 unknown through 5 poor
      expect(component.labels).toHaveLength(6)
    })

    it('follows a change made elsewhere', () => {
      const component = create(HapAirQualitySensorManageComponent, sensor({ PM2_5Density: 12 }))

      const updated = sensor({ AirQuality: 5, PM2_5Density: 90 })
      component.$accessories.accessories.services[0] = updated
      accessoryData.next([updated])

      expect(component.airQuality).toBe(5)
      expect(component.pm25).toBe(90)
    })
  })
})
