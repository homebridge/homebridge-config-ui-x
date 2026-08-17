import type { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import type { AccessoriesService } from '@/app/core/accessories/accessories.service'
import type { FakeToastr, MatterServiceFixture } from '@/testing'

import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'
import { Subject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ACCESSORY_MANAGE_MODAL_DATA } from '@/app/core/accessories/types/base-manage.component'
import { WindowCoveringManageComponent } from '@/app/core/accessories/types/matter/window-covering/window-covering.manage.component'
import { activeModalStub, makeSettings, matterService, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The matter window covering modal.
 *
 * ⚠️ **A covering may lift, tilt, or both, and writing a position it has no
 * feature for is refused by the cluster.** The modal therefore shows only the
 * sliders the device actually has — a Venetian blind that only tilts must not be
 * given a lift slider, because every drag of it would fail.
 *
 * ⚠️ **Matter counts a covering the opposite way round from the UI**: 0 is open
 * and 10000 is closed, in hundredths of a percent. Those conversions live in
 * `matter-device.utils.ts` and have their own spec; what is checked here is that
 * this modal reads and writes through them rather than doing its own arithmetic.
 */
describe('windowCoveringManageComponent', () => {
  let toastr: FakeToastr
  let accessoryData: Subject<unknown>

  /**
   * A covering.
   * @param cluster - the windowCovering cluster attributes it reports
   */
  function covering(cluster: Record<string, unknown>): MatterServiceFixture {
    return matterService({ deviceType: 'WindowCovering', clusters: { windowCovering: cluster } })
  }

  /** One that lifts only, half open. */
  const lifting = () => covering({ currentPositionLiftPercent100ths: 5000, targetPositionLiftPercent100ths: 5000 })

  /** One that tilts only, a quarter open. */
  const tilting = () => covering({ currentPositionTiltPercent100ths: 7500, targetPositionTiltPercent100ths: 7500 })

  /** One that does both. */
  const both = () => covering({
    currentPositionLiftPercent100ths: 2000,
    targetPositionLiftPercent100ths: 2000,
    currentPositionTiltPercent100ths: 6000,
    targetPositionTiltPercent100ths: 6000,
  })

  /**
   * Open the modal.
   *
   * ⚠️ NouisliderComponent and FormsModule are both dropped: the sliders carry
   * `[(ngModel)]`, and leaving NgModel active with the element unknown fails with
   * NG01203.
   * @param service - the covering it is opened for
   */
  function create(service: ServiceTypeX): WindowCoveringManageComponent {
    TestBed.resetTestingModule()
    toastr = toastrStub()
    accessoryData = new Subject()

    TestBed.configureTestingModule({
      imports: [WindowCoveringManageComponent],
      providers: [
        provideTestTranslate(),
        provideFakes({ toastr, settings: makeSettings() }),
        { provide: NgbActiveModal, useValue: activeModalStub() },
        {
          provide: ACCESSORY_MANAGE_MODAL_DATA,
          useValue: {
            service,
            $accessories: { accessoryData, accessories: { services: [service] } } as unknown as AccessoriesService,
          },
        },
      ],
    })

    TestBed.overrideComponent(WindowCoveringManageComponent, {
      set: { imports: [TranslatePipe], schemas: [NO_ERRORS_SCHEMA] },
    })

    const fixture = TestBed.createComponent(WindowCoveringManageComponent)
    fixture.detectChanges()
    return fixture.componentInstance
  }

  /** Push a slider change through the base class's 500ms debounce. */
  async function slide(action: () => void) {
    action()
    await vi.advanceTimersByTimeAsync(500)
  }

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(console.error).mockClear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('which sliders it offers', () => {
    it('offers only the lift slider to a covering that lifts', () => {
      const modal = create(lifting())

      expect(modal.supportsLift).toBe(true)
      expect(modal.supportsTilt).toBe(false)
    })

    it('offers only the tilt slider to a covering that tilts', () => {
      // A Venetian blind. A lift slider here would be refused on every drag
      const modal = create(tilting())

      expect(modal.supportsLift).toBe(false)
      expect(modal.supportsTilt).toBe(true)
    })

    it('offers both to a covering that does both', () => {
      const modal = create(both())

      expect(modal.supportsLift).toBe(true)
      expect(modal.supportsTilt).toBe(true)
    })

    it('falls back to a lift slider when the device reports neither', () => {
      // Rather than an empty modal with nothing in it at all
      const modal = create(covering({}))

      expect(modal.supportsLift).toBe(true)
    })
  })

  describe('what it starts on', () => {
    it('reads the lift position the covering is at', () => {
      // 5000 hundredths closed is 50% open
      const modal = create(lifting())

      expect(modal.targetPosition.value).toBe(50)
      expect(modal.currentPosition).toBe(50)
    })

    it('reads the tilt position the covering is at', () => {
      const modal = create(tilting())

      expect(modal.targetTilt.value).toBe(25)
      expect(modal.currentTilt).toBe(25)
    })

    it('gives both sliders the full range', () => {
      const modal = create(both())

      expect(modal.targetPosition).toMatchObject({ min: 0, max: 100, step: 1 })
      expect(modal.targetTilt).toMatchObject({ min: 0, max: 100, step: 1 })
    })

    it('summarises a lifting covering by its lift', () => {
      expect(create(both()).summaryPercentage).toBe(80)
    })

    it('summarises a tilt-only covering by its tilt', () => {
      // The same value the tile shows, so the two cannot disagree
      expect(create(tilting()).summaryPercentage).toBe(25)
    })
  })

  describe('moving the covering', () => {
    it('writes a new lift position to the lift attribute', async () => {
      const service = lifting()
      const modal = create(service)

      await slide(() => {
        modal.targetPosition.value = 75
        modal.onTargetPositionChange()
      })

      expect(service.writes).toEqual([
        { cluster: 'windowCovering', attributes: { targetPositionLiftPercent100ths: 2500 } },
      ])
    })

    it('writes a new tilt position to the tilt attribute', async () => {
      // ⚠️ A tilt written to the lift attribute is the classic mistake here, and
      // it moves the whole blind instead of the slats
      const service = tilting()
      const modal = create(service)

      await slide(() => {
        modal.targetTilt.value = 100
        modal.onTargetTiltChange()
      })

      expect(service.writes).toEqual([
        { cluster: 'windowCovering', attributes: { targetPositionTiltPercent100ths: 0 } },
      ])
    })

    it('sends one write for a slider dragged across several values', async () => {
      // The debounce is what stops a drag becoming twenty writes
      const service = lifting()
      const modal = create(service)

      await slide(() => {
        modal.targetPosition.value = 60
        modal.onTargetPositionChange()
        modal.targetPosition.value = 70
        modal.onTargetPositionChange()
        modal.targetPosition.value = 80
        modal.onTargetPositionChange()
      })

      expect(service.writes).toHaveLength(1)
      expect(service.writes[0].attributes).toEqual({ targetPositionLiftPercent100ths: 2000 })
    })

    it('puts the lift slider back when the write is refused', async () => {
      // Otherwise the slider sits at a position the covering is not in
      const service = lifting()
      service.failWrites('windowCovering', new Error('device unreachable'))
      const modal = create(service)

      await slide(() => {
        modal.targetPosition.value = 90
        modal.onTargetPositionChange()
      })

      expect(modal.targetPosition.value).toBe(50)
      expect(toastr.error).toHaveBeenCalled()
    })

    it('puts the tilt slider back when the write is refused', async () => {
      const service = tilting()
      service.failWrites('windowCovering', new Error('device unreachable'))
      const modal = create(service)

      await slide(() => {
        modal.targetTilt.value = 90
        modal.onTargetTiltChange()
      })

      expect(modal.targetTilt.value).toBe(25)
      expect(toastr.error).toHaveBeenCalled()
    })
  })

  describe('when the covering moves by itself', () => {
    it('follows the lift position', () => {
      // Someone pulled the cord, or another app moved it
      const service = lifting()
      const modal = create(service)

      ;(service.clusters!.windowCovering as Record<string, unknown>).currentPositionLiftPercent100ths = 1000
      accessoryData.next([service])

      expect(modal.targetPosition.value).toBe(90)
    })

    it('follows the tilt position', () => {
      const service = tilting()
      const modal = create(service)

      ;(service.clusters!.windowCovering as Record<string, unknown>).currentPositionTiltPercent100ths = 0
      accessoryData.next([service])

      expect(modal.targetTilt.value).toBe(100)
    })
  })
})
