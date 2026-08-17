import type { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import type { AccessoriesService } from '@/app/core/accessories/accessories.service'
import type { FakeToastr } from '@/testing'

import { DecimalPipe, UpperCasePipe } from '@angular/common'
import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'
import { Subject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ACCESSORY_MANAGE_MODAL_DATA } from '@/app/core/accessories/types/base-manage.component'
import { DoorManageComponent } from '@/app/core/accessories/types/hap/door/door.manage.component'
import { DoorbellManageComponent } from '@/app/core/accessories/types/hap/doorbell/doorbell.manage.component'
import { FanManageComponent } from '@/app/core/accessories/types/hap/fan/fan.manage.component'
import { LockMechanismManageComponent } from '@/app/core/accessories/types/hap/lock-mechanism/lock-mechanism.manage.component'
import { MicrophoneManageComponent } from '@/app/core/accessories/types/hap/microphone/microphone.manage.component'
import { SpeakerManageComponent } from '@/app/core/accessories/types/hap/speaker/speaker.manage.component'
import { ValveManageComponent } from '@/app/core/accessories/types/hap/valve/valve.manage.component'
import { WindowCoveringManageComponent } from '@/app/core/accessories/types/hap/window-covering/window-covering.manage.component'
import { WindowManageComponent } from '@/app/core/accessories/types/hap/window/window.manage.component'
import { DurationPipe } from '@/app/core/pipes/duration.pipe'
import { activeModalStub, characteristic, hapService, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The remaining HAP manage modals — the ones with one or two controls each.
 *
 * Individually they are small, but there are a dozen of them and several come in
 * near-identical sets (three position modals, three media modals). That is the
 * risk being covered here: the characteristic *name* each control writes. A
 * wrong name resolves to `null` from `getCharacteristic`, and the resulting
 * throw happens inside a debounce callback where nothing catches it — so the
 * slider simply stops working, with no error shown anywhere.
 *
 * Each rule is therefore asserted against every member of its set, so a fix or a
 * copy-paste applied to only one of them shows up.
 */
describe('the simple HAP manage modals', () => {
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
   * Build a manage modal for a service.
   *
   * ⚠️ NouisliderComponent and FormsModule are both dropped: the sliders carry
   * `[(ngModel)]`, and leaving NgModel active with the slider element unknown
   * fails with NG01203. Pipes stay — an unknown pipe is a hard template error
   * even under NO_ERRORS_SCHEMA.
   * @param type - the modal component
   * @param target - the accessory service it is opened for
   */
  function create<T>(type: new (...args: any[]) => T, target: ServiceTypeX): T {
    TestBed.resetTestingModule()
    toastr = toastrStub()

    TestBed.configureTestingModule({
      imports: [type as any],
      providers: [
        provideTestTranslate(),
        provideFakes({ toastr }),
        { provide: NgbActiveModal, useValue: activeModalStub() },
        {
          provide: ACCESSORY_MANAGE_MODAL_DATA,
          useValue: { service: target, $accessories: accessoriesStub(target) },
        },
      ],
    })

    TestBed.overrideComponent(type as any, {
      set: {
        imports: [TranslatePipe, DurationPipe, DecimalPipe, UpperCasePipe],
        schemas: [NO_ERRORS_SCHEMA],
      },
    })

    const fixture = TestBed.createComponent(type as any)
    fixture.detectChanges()
    return fixture.componentInstance as T
  }

  /** Push a slider change through the base class's 500ms debounce. */
  async function slide(action: () => void, ms = 500) {
    action()
    await vi.advanceTimersByTimeAsync(ms)
  }

  /**
   * Every `setValue` call on a service, in the order they happened.
   *
   * Sorted by `invocationCallOrder` rather than collected per characteristic,
   * so an assertion about which write came first means what it says.
   * @param target - the service to read the calls from
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
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // door, window and window-covering are three copies of the same modal
  describe.each([
    ['door', DoorManageComponent as new (...args: any[]) => DoorManageComponent],
    ['window', WindowManageComponent as unknown as new (...args: any[]) => DoorManageComponent],
    ['window covering', WindowCoveringManageComponent as unknown as new (...args: any[]) => DoorManageComponent],
  ])('the %s modal', (_name, type) => {
    function positionService(current = 40, target = 40) {
      return hapService({
        type: 'Door',
        characteristics: [
          characteristic('CurrentPosition', current, { minValue: 0, maxValue: 100, minStep: 1 }),
          characteristic('TargetPosition', target, { minValue: 0, maxValue: 100, minStep: 1 }),
          characteristic('PositionState', 2),
        ],
      })
    }

    it('reads the slider range off the characteristic', () => {
      const service = hapService({
        type: 'Door',
        characteristics: [
          characteristic('CurrentPosition', 40),
          characteristic('TargetPosition', 40, { minValue: 0, maxValue: 100, minStep: 5 }),
        ],
      })
      const component = create(type, service)

      expect(component.targetPosition).toEqual({ value: 40, min: 0, max: 100, step: 5 })
    })

    it('writes the new position to TargetPosition', async () => {
      const service = positionService()
      const component = create(type, service)

      await slide(() => {
        component.targetPosition.value = 80
        component.onTargetPositionChange()
      })

      expect(writesTo(service)).toEqual([{ type: 'TargetPosition', value: 80 }])
    })

    it('shows it as opening while it moves towards the new position', async () => {
      // The accessory reports PositionState itself, but not until it starts
      // moving - without this the tile shows nothing happening
      const service = positionService(40, 40)
      const component = create(type, service)

      await slide(() => {
        component.targetPosition.value = 80
        component.onTargetPositionChange()
      })

      expect(service.values.PositionState).toBe(1)
    })

    it('shows it as closing while it moves the other way', async () => {
      const service = positionService(40, 40)
      const component = create(type, service)

      await slide(() => {
        component.targetPosition.value = 10
        component.onTargetPositionChange()
      })

      expect(service.values.PositionState).toBe(0)
    })

    it('leaves the state alone when the position has not changed', async () => {
      const service = positionService(40, 40)
      const component = create(type, service)

      await slide(() => {
        component.targetPosition.value = 40
        component.onTargetPositionChange()
      })

      expect(service.values.PositionState).toBe(2)
    })

    it('follows a position change made elsewhere', () => {
      const service = positionService()
      const component = create(type, service)

      const updated = positionService(70, 70)
      component.$accessories.accessories.services[0] = updated
      accessoryData.next([updated])

      expect(component.targetPosition.value).toBe(70)
    })
  })

  // doorbell, microphone and speaker are three copies of the same modal
  describe.each([
    ['doorbell', DoorbellManageComponent as new (...args: any[]) => DoorbellManageComponent],
    ['microphone', MicrophoneManageComponent as unknown as new (...args: any[]) => DoorbellManageComponent],
    ['speaker', SpeakerManageComponent as unknown as new (...args: any[]) => DoorbellManageComponent],
  ])('the %s modal', (_name, type) => {
    function mediaService(muted = false, volume = 60) {
      return hapService({
        type: 'Speaker',
        characteristics: [
          characteristic('Mute', muted),
          characteristic('Volume', volume, { minValue: 0, maxValue: 100, minStep: 1 }),
          characteristic('Active', 1),
          characteristic('TargetMediaState', 0),
        ],
      })
    }

    it('reads the mute state as its switch, not the active state', () => {
      // The switch on these three is mute, so an unmuted accessory shows off
      const component = create(type, mediaService(true))

      expect(component.targetMode).toBe(true)
    })

    it('writes the switch to Mute', () => {
      const service = mediaService(false)
      const component = create(type, service)

      component.setTargetMode(true, mouseEvent())

      expect(writesTo(service)).toEqual([{ type: 'Mute', value: true }])
    })

    it('writes the volume slider to Volume', async () => {
      const service = mediaService()
      const component = create(type, service)

      await slide(() => {
        component.targetVolume.value = 25
        component.onVolumeStateChange()
      })

      expect(writesTo(service)).toEqual([{ type: 'Volume', value: 25 }])
    })

    it('writes the active buttons to Active', () => {
      const service = mediaService()
      const component = create(type, service)

      component.setActive(0, mouseEvent())

      expect(writesTo(service)).toEqual([{ type: 'Active', value: 0 }])
    })

    it('writes the media buttons to TargetMediaState', () => {
      const service = mediaService()
      const component = create(type, service)

      component.setTargetState(1, mouseEvent())

      expect(writesTo(service)).toEqual([{ type: 'TargetMediaState', value: 1 }])
    })

    it('follows a mute change made elsewhere', () => {
      const service = mediaService(false, 60)
      const component = create(type, service)

      const updated = mediaService(true, 30)
      component.$accessories.accessories.services[0] = updated
      accessoryData.next([updated])

      expect(component.targetMode).toBe(true)
      expect(component.targetVolume.value).toBe(30)
    })
  })

  /**
   * Blinds that also tilt.
   *
   * ⚠️ **The two axes are separate characteristics and only some blinds have
   * either.** A slider written to the wrong axis turns the slats the wrong way,
   * and one offered for an axis the blind does not have writes nowhere at all.
   */
  describe('the window covering tilt controls', () => {
    /** A blind, with whichever tilt axes it is given. */
    function blind(axes: { horizontal?: number, vertical?: number } = {}) {
      const characteristics = [
        characteristic('CurrentPosition', 40, { minValue: 0, maxValue: 100, minStep: 1 }),
        characteristic('TargetPosition', 40, { minValue: 0, maxValue: 100, minStep: 1 }),
        characteristic('PositionState', 2),
      ]

      if (axes.horizontal !== undefined) {
        characteristics.push(characteristic('TargetHorizontalTiltAngle', axes.horizontal, { minValue: -90, maxValue: 90, minStep: 1 }))
      }
      if (axes.vertical !== undefined) {
        characteristics.push(characteristic('TargetVerticalTiltAngle', axes.vertical, { minValue: -90, maxValue: 90, minStep: 1 }))
      }

      return hapService({ type: 'WindowCovering', characteristics })
    }

    it.each([
      ['horizontal', { horizontal: 0 }, 'targetHorizontalTilt', 'onTargetHorizontalTiltChange', 'TargetHorizontalTiltAngle'],
      ['vertical', { vertical: 0 }, 'targetVerticalTilt', 'onTargetVerticalTiltChange', 'TargetVerticalTiltAngle'],
    ])('writes the %s slider to its own characteristic', async (_case, axes, field, method, type) => {
      const service = blind(axes)
      const component = create(WindowCoveringManageComponent, service) as any

      await slide(() => {
        component[field].value = 45
        component[method]()
      })

      expect(writesTo(service)).toEqual([{ type, value: 45 }])
    })

    it('keeps the two axes apart on a blind that has both', async () => {
      // ⚠️ One slider writing both would twist the slats on an axis the user
      // never touched
      const service = blind({ horizontal: 0, vertical: 0 })
      const component = create(WindowCoveringManageComponent, service) as any

      await slide(() => {
        component.targetHorizontalTilt.value = 30
        component.onTargetHorizontalTiltChange()
      })

      expect(writesTo(service)).toEqual([{ type: 'TargetHorizontalTiltAngle', value: 30 }])
    })

    it('takes the slider bounds from the accessory, not the full tilt range', () => {
      const service = hapService({
        type: 'WindowCovering',
        characteristics: [
          characteristic('CurrentPosition', 40),
          characteristic('TargetPosition', 40, { minValue: 0, maxValue: 100, minStep: 1 }),
          characteristic('TargetHorizontalTiltAngle', 0, { minValue: 0, maxValue: 90, minStep: 5 }),
        ],
      })

      const component = create(WindowCoveringManageComponent, service) as any

      expect(component.targetHorizontalTilt).toMatchObject({ min: 0, max: 90, step: 5 })
    })

    it('offers no tilt slider on a blind that does not tilt', () => {
      const component = create(WindowCoveringManageComponent, blind()) as any

      expect(component.targetHorizontalTilt).toBeUndefined()
      expect(component.targetVerticalTilt).toBeUndefined()
    })

    it('follows a tilt change made elsewhere', () => {
      const component = create(WindowCoveringManageComponent, blind({ horizontal: 0, vertical: 0 })) as any

      const updated = blind({ horizontal: 60, vertical: -30 })
      component.$accessories.accessories.services[0] = updated
      accessoryData.next([updated])

      expect(component.targetHorizontalTilt.value).toBe(60)
      expect(component.targetVerticalTilt.value).toBe(-30)
    })

    it('copes with an update on a blind that has no tilt', () => {
      const component = create(WindowCoveringManageComponent, blind()) as any

      const updated = blind()
      component.$accessories.accessories.services[0] = updated

      expect(() => accessoryData.next([updated])).not.toThrow()
    })
  })

  describe('the fan modal', () => {
    /** A Fan (v1) accessory, which reports power as a boolean `On`. */
    function fanV1(on = true, speed = 50) {
      return hapService({
        type: 'Fan',
        characteristics: [
          characteristic('On', on),
          characteristic('RotationSpeed', speed, { minValue: 0, maxValue: 100, minStep: 1 }),
          characteristic('RotationDirection', 0),
        ],
      })
    }

    /** A Fanv2 accessory, which reports power as a numeric `Active`. */
    function fanV2(active = 1, speed = 50) {
      return hapService({
        type: 'Fanv2',
        characteristics: [
          characteristic('Active', active),
          characteristic('RotationSpeed', speed, { minValue: 0, maxValue: 100, minStep: 1 }),
        ],
      })
    }

    it('reads a v1 fan as on from its boolean', () => {
      expect(create(FanManageComponent, fanV1(true)).targetMode).toBe(true)
      expect(create(FanManageComponent, fanV1(false)).targetMode).toBe(false)
    })

    it('reads a v2 fan as on from its numeric active state', () => {
      expect(create(FanManageComponent, fanV2(1)).targetMode).toBe(true)
      expect(create(FanManageComponent, fanV2(0)).targetMode).toBe(false)
    })

    it('treats an out-of-spec active value as off', () => {
      // HAP only defines 0 and 1 here, so the two cases above pass whether the
      // check is `=== 1` or merely truthy. This one pins the strict reading:
      // a plugin reporting something else is treated as off rather than on
      expect(create(FanManageComponent, fanV2(2)).targetMode).toBe(false)
    })

    it('writes a boolean to On for a v1 fan', () => {
      const service = fanV1(false)
      const component = create(FanManageComponent, service)

      component.setTargetMode(true, mouseEvent())

      expect(writesTo(service)).toEqual([{ type: 'On', value: true }])
    })

    it('writes a number to Active for a v2 fan', () => {
      // A boolean here is rejected by HAP as the wrong format
      const service = fanV2(0)
      const component = create(FanManageComponent, service)

      component.setTargetMode(true, mouseEvent())

      expect(writesTo(service)).toEqual([{ type: 'Active', value: 1 }])
    })

    it('writes zero rather than false when a v2 fan is switched off', () => {
      const service = fanV2(1)
      const component = create(FanManageComponent, service)

      component.setTargetMode(false, mouseEvent())

      expect(writesTo(service)).toEqual([{ type: 'Active', value: 0 }])
    })

    it('switches the fan on when the speed is raised off zero', async () => {
      const service = fanV1(false, 0)
      const component = create(FanManageComponent, service)

      await slide(() => {
        component.targetRotationSpeed.value = 40
        component.onTargetRotationSpeedChange()
      })

      expect(writesTo(service)).toEqual([
        { type: 'RotationSpeed', value: 40 },
        { type: 'On', value: true },
      ])
    })

    it('switches the fan off when the speed is dragged to zero', async () => {
      const service = fanV1(true, 50)
      const component = create(FanManageComponent, service)

      await slide(() => {
        component.targetRotationSpeed.value = 0
        component.onTargetRotationSpeedChange()
      })

      expect(writesTo(service)).toEqual([
        { type: 'RotationSpeed', value: 0 },
        { type: 'On', value: false },
      ])
    })

    it('switches a v2 fan on with a number when the speed is raised off zero', async () => {
      // ⚠️ The v1 cases above go through the `On` arm. A v2 fan takes the `Active`
      // arm right beside it, and a boolean written there is refused by HAP - so
      // the speed would move and the fan would stay off
      const service = fanV2(0, 0)
      const component = create(FanManageComponent, service)

      await slide(() => {
        component.targetRotationSpeed.value = 40
        component.onTargetRotationSpeedChange()
      })

      expect(writesTo(service)).toEqual([
        { type: 'RotationSpeed', value: 40 },
        { type: 'Active', value: 1 },
      ])
    })

    it('switches a v2 fan off with a zero when the speed is dragged to zero', async () => {
      const service = fanV2(1, 50)
      const component = create(FanManageComponent, service)

      await slide(() => {
        component.targetRotationSpeed.value = 0
        component.onTargetRotationSpeedChange()
      })

      expect(writesTo(service)).toEqual([
        { type: 'RotationSpeed', value: 0 },
        { type: 'Active', value: 0 },
      ])
    })

    it.each([
      ['a v1 fan', () => fanV1(true, 50), () => fanV1(false, 20), false],
      ['a v2 fan', () => fanV2(1, 50), () => fanV2(0, 20), false],
    ])('follows a change made elsewhere on %s', async (_case, initial, changed, expectedMode) => {
      const component = create(FanManageComponent, initial())

      const updated = changed()
      component.$accessories.accessories.services[0] = updated
      accessoryData.next([updated])

      expect(component.targetMode).toBe(expectedMode)
      expect(component.targetRotationSpeed.value).toBe(20)
    })

    it('does not touch the power when the fan is already in the right state', async () => {
      const service = fanV1(true, 50)
      const component = create(FanManageComponent, service)

      await slide(() => {
        component.targetRotationSpeed.value = 90
        component.onTargetRotationSpeedChange()
      })

      expect(writesTo(service)).toEqual([{ type: 'RotationSpeed', value: 90 }])
    })

    it('moves the slider to full when switching on a fan sitting at zero', () => {
      const service = fanV1(false, 0)
      const component = create(FanManageComponent, service)

      component.setTargetMode(true, mouseEvent())

      expect(component.targetRotationSpeed.value).toBe(100)
    })

    it('offers the direction control only to a fan that has one', () => {
      expect(create(FanManageComponent, fanV1()).hasRotationDirection).toBe(true)
      expect(create(FanManageComponent, fanV2()).hasRotationDirection).toBe(false)
    })

    it('writes the direction to RotationDirection', () => {
      const service = fanV1()
      const component = create(FanManageComponent, service)

      component.setRotationDirection(1, mouseEvent())

      expect(writesTo(service)).toEqual([{ type: 'RotationDirection', value: 1 }])
    })
  })

  describe('the valve modal', () => {
    function valveService(active = 0, duration = 300) {
      return hapService({
        type: 'Valve',
        characteristics: [
          characteristic('Active', active),
          characteristic('SetDuration', duration, { minValue: 0, maxValue: 3600, minStep: 60 }),
        ],
      })
    }

    it('writes the switch to Active', () => {
      const service = valveService()
      const component = create(ValveManageComponent, service)

      component.setTargetMode(true, mouseEvent())

      expect(writesTo(service)).toEqual([{ type: 'Active', value: true }])
    })

    it('writes the run time to SetDuration', async () => {
      const service = valveService()
      const component = create(ValveManageComponent, service)

      await slide(() => {
        component.targetSetDuration.value = 600
        component.onSetDurationStateChange()
      })

      expect(writesTo(service)).toEqual([{ type: 'SetDuration', value: 600 }])
    })

    it('reads the run time range off the characteristic', () => {
      const component = create(ValveManageComponent, valveService(0, 300))

      expect(component.targetSetDuration).toEqual({ value: 300, min: 0, max: 3600, step: 60 })
    })

    it('offers no run time control to a valve without one', () => {
      const component = create(ValveManageComponent, hapService({
        type: 'Valve',
        characteristics: [characteristic('Active', 0)],
      }))

      expect(component.targetSetDuration).toBeUndefined()
    })

    it('survives a live update on a valve with no run time', () => {
      const service = hapService({ type: 'Valve', characteristics: [characteristic('Active', 0)] })
      const component = create(ValveManageComponent, service)

      expect(() => accessoryData.next([service])).not.toThrow()
      expect(component.targetSetDuration).toBeUndefined()
    })
  })

  describe('the lock modal', () => {
    /** A lock, optionally with the management service folded in beside it. */
    function lockService(options: { target?: number, timeout?: number } = {}) {
      const lock = hapService({
        type: 'LockMechanism',
        serviceName: 'Front Door',
        characteristics: [
          characteristic('LockCurrentState', 1),
          characteristic('LockTargetState', options.target ?? 1),
        ],
      })

      if (options.timeout !== undefined) {
        const management = hapService({
          type: 'LockManagement',
          serviceName: 'Front Door',
          uniqueId: 'hap-lock-mgmt',
          characteristics: [
            characteristic('LockManagementAutoSecurityTimeout', options.timeout, { minValue: 0, maxValue: 3600, minStep: 10 }),
          ],
        })
        lock.linkedServices = { 11: management as any }
      }

      return lock
    }

    function managementOf(lock: ServiceTypeX) {
      return Object.values(lock.linkedServices!)[0] as unknown as ServiceTypeX
    }

    it('writes the lock buttons to LockTargetState', () => {
      const service = lockService()
      const component = create(LockMechanismManageComponent, service)

      component.setTargetMode(0, mouseEvent())

      expect(writesTo(service)).toEqual([{ type: 'LockTargetState', value: 0 }])
    })

    it('offers no auto-relock control on a lock with no management service', () => {
      const component = create(LockMechanismManageComponent, lockService())

      expect(component.serviceManagement).toBeUndefined()
      expect(component.targetLockManagementAutoSecurityTimeout).toBeUndefined()
    })

    it('picks up the management service folded in beside it', () => {
      // Which is the whole reason AccessoriesService links the two
      const service = lockService({ timeout: 300 })
      const component = create(LockMechanismManageComponent, service)

      expect(component.serviceManagement).toBe(managementOf(service))
      expect(component.targetLockManagementAutoSecurityTimeout).toEqual({ value: 300, min: 0, max: 3600, step: 10 })
    })

    it('writes the auto-relock time to the management service, not the lock', async () => {
      // The two are separate HAP services; writing it on the mechanism would
      // resolve to null and throw inside the debounce
      const service = lockService({ timeout: 300 })
      const component = create(LockMechanismManageComponent, service)

      await slide(() => {
        component.targetLockManagementAutoSecurityTimeout.value = 600
        component.onLockManagementAutoSecurityTimeoutStateChange()
      }, 300)

      expect(writesTo(managementOf(service))).toEqual([
        { type: 'LockManagementAutoSecurityTimeout', value: 600 },
      ])
      expect(writesTo(service)).toEqual([])
    })

    it('shows the lock re-locking itself once the auto-relock time is up', async () => {
      // The accessory re-locks on its own, so the modal has to predict it or
      // the switch stays showing unlocked
      const service = lockService({ target: 1, timeout: 10 })
      const component = create(LockMechanismManageComponent, service)

      component.setTargetMode(0, mouseEvent())
      await vi.advanceTimersByTimeAsync(10000)
      expect(component.targetMode).toBe(0)

      await vi.advanceTimersByTimeAsync(300)

      expect(component.targetMode).toBe(1)
    })

    it('starts the countdown again when the lock is unlocked a second time', async () => {
      const service = lockService({ target: 1, timeout: 10 })
      const component = create(LockMechanismManageComponent, service)

      component.setTargetMode(0, mouseEvent())
      await vi.advanceTimersByTimeAsync(9000)
      // Unlocking again has to restart the clock, not leave the first one running
      component.setTargetMode(0, mouseEvent())
      await vi.advanceTimersByTimeAsync(2000)
      expect(component.targetMode).toBe(0)

      await vi.advanceTimersByTimeAsync(8300)

      expect(component.targetMode).toBe(1)
    })

    it('cancels the countdown when the user locks it by hand', async () => {
      const service = lockService({ target: 1, timeout: 10 })
      const component = create(LockMechanismManageComponent, service)
      component.setTargetMode(0, mouseEvent())

      component.setTargetMode(1, mouseEvent())
      await vi.advanceTimersByTimeAsync(20000)

      expect(component.targetMode).toBe(1)
      expect(writesTo(service)).toEqual([
        { type: 'LockTargetState', value: 0 },
        { type: 'LockTargetState', value: 1 },
      ])
    })

    it('does not count down when there is no auto-relock time set', async () => {
      const service = lockService({ target: 1, timeout: 0 })
      const component = create(LockMechanismManageComponent, service)

      component.setTargetMode(0, mouseEvent())
      await vi.advanceTimersByTimeAsync(60000)

      expect(component.targetMode).toBe(0)
    })

    it('follows a lock change made elsewhere', () => {
      const service = lockService({ target: 1, timeout: 300 })
      const component = create(LockMechanismManageComponent, service)

      const updated = lockService({ target: 0, timeout: 600 })
      component.serviceManagement = managementOf(updated)
      component.$accessories.accessories.services[0] = updated
      accessoryData.next([updated])

      expect(component.targetMode).toBe(0)
      expect(component.targetLockManagementAutoSecurityTimeout.value).toBe(600)
    })
  })
})
