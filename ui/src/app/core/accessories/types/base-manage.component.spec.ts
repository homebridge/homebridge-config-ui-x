import type { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import type { AccessoriesService } from '@/app/core/accessories/accessories.service'
import type { FakeToastr } from '@/testing'
import type { ComponentFixture } from '@angular/core/testing'
import type { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'

import { ChangeDetectionStrategy, Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { NgbActiveModal as NgbActiveModalToken } from '@ng-bootstrap/ng-bootstrap/modal'
import { Subject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ACCESSORY_MANAGE_MODAL_DATA, BaseManageComponent } from '@/app/core/accessories/types/base-manage.component'
import { activeModalStub, hapService, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * Every one of the sixty-odd accessory manage modals extends this class, so a
 * regression here breaks all of them at once. It is exercised through a tiny
 * local subclass rather than through one real modal, so the assertions are
 * about the base class and not about whichever device type was picked.
 *
 * The protected helpers are re-exposed as public methods on the subclass: they
 * are protected so templates and children can use them, and a spec is exactly
 * the case the modifier is meant to keep out.
 */
@Component({
  selector: 'app-test-manage',
  // Two sliders plus one element outside the default selector, so the gradient
  // helper can be shown to paint the right set
  // Flush left and newline-terminated because the lint template processor
  // treats the inline template as a file of its own
  template: `<div class="noUi-target first"></div>
<div class="noUi-target second"></div>
<div class="other-slider"></div>
`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TestManageComponent extends BaseManageComponent {
  public setupCalls = 0
  public updateCalls = 0

  /** The service reference the last update was observed with. */
  public seenServices: Array<ServiceTypeX | undefined> = []

  public readonly changes$ = new Subject<number>()
  public debounced: number[] = []

  protected setupComponent(): void {
    this.setupCalls += 1
  }

  protected handleAccessoryUpdate(): void {
    this.updateCalls += 1
    this.seenServices.push(this.service)
  }

  public debounce(ms?: number) {
    this.createDebouncedSubscription(this.changes$, value => this.debounced.push(value), ms)
  }

  public gradient(css: string, selector?: string) {
    if (selector === undefined) {
      this.applySliderGradient(css)
    } else {
      this.applySliderGradient(css, selector)
    }
  }

  public raiseError(error?: unknown) {
    this.showGenericErrorToast(error)
  }

  public blur(event: MouseEvent) {
    this.blurTarget(event)
  }
}

describe('BaseManageComponent', () => {
  let fixture: ComponentFixture<TestManageComponent>
  let component: TestManageComponent
  let activeModal: NgbActiveModal
  let toastr: FakeToastr
  let accessories: AccessoriesService
  let accessoryData: Subject<unknown>

  interface CreateOptions {
    /** Omit either half of the modal data to drive the null-safety path. */
    service?: ServiceTypeX | undefined
    withAccessories?: boolean
  }

  /**
   * A stand-in for AccessoriesService holding only what the base class reads:
   * the live event stream and the flat service list it looks the current
   * object up in.
   */
  function accessoriesStub(services: ServiceTypeX[]) {
    accessoryData = new Subject()
    return {
      accessoryData,
      accessories: { services },
    } as unknown as AccessoriesService
  }

  function create(options: CreateOptions = {}) {
    TestBed.resetTestingModule()

    const service = 'service' in options ? options.service : hapService({ uniqueId: 'hap-1' })
    accessories = accessoriesStub(service ? [service] : [])
    activeModal = activeModalStub()
    toastr = toastrStub()

    TestBed.configureTestingModule({
      imports: [TestManageComponent],
      providers: [
        provideTestTranslate(),
        provideFakes({ toastr }),
        { provide: NgbActiveModalToken, useValue: activeModal },
        {
          provide: ACCESSORY_MANAGE_MODAL_DATA,
          useValue: {
            service,
            $accessories: (options.withAccessories ?? true) ? accessories : undefined,
          },
        },
      ],
    })

    fixture = TestBed.createComponent(TestManageComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
    return component
  }

  /** Let the requestAnimationFrame stub, which runs off a timer, fire. */
  function flushFrames(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0))
  }

  beforeEach(() => {
    // ⚠️ spyOn on an already-spied method hands back the SAME spy, so its call
    // list survives into the next test unless it is cleared here
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(console.error).mockClear()
    create()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initialisation', () => {
    it('takes the service and the accessories service from the modal data', () => {
      expect(component.service.uniqueId).toBe('hap-1')
      expect(component.$accessories).toBe(accessories)
    })

    it('runs the child setup exactly once', () => {
      fixture.detectChanges()
      fixture.detectChanges()

      expect(component.setupCalls).toBe(1)
    })

    it('dismisses rather than rendering when no service was provided', () => {
      create({ service: undefined })

      expect(activeModal.dismiss).toHaveBeenCalledWith('Missing required data')
      expect(console.error).toHaveBeenCalled()
      expect(component.setupCalls).toBe(0)
    })

    it('dismisses rather than rendering when no accessories service was provided', () => {
      create({ withAccessories: false })

      expect(activeModal.dismiss).toHaveBeenCalledWith('Missing required data')
      expect(component.setupCalls).toBe(0)
    })

    it('dismisses with a reason the caller can tell apart from the close button', () => {
      // The opener branches on the dismiss reason, so the two must differ
      create()
      component.dismissModal()

      expect(activeModal.dismiss).toHaveBeenCalledWith('Dismiss')
    })
  })

  describe('live accessory updates', () => {
    it('swaps in the newest service object rather than keeping the stale one', () => {
      // Zoneless Angular does not see a mutated object, so the service list
      // holds a fresh object after every payload
      const replacement = hapService({ uniqueId: 'hap-1', serviceName: 'Renamed' })
      accessories.accessories.services[0] = replacement

      accessoryData.next([replacement])

      expect(component.service).toBe(replacement)
      expect(component.seenServices).toEqual([replacement])
    })

    it('hands the child the new reference before asking it to update', () => {
      // A child reading `this.service` inside handleAccessoryUpdate must see
      // the new object, not the one it was constructed with
      const original = component.service
      const replacement = hapService({ uniqueId: 'hap-1' })
      accessories.accessories.services[0] = replacement

      accessoryData.next([replacement])

      expect(component.seenServices[0]).not.toBe(original)
    })

    it('keeps the existing service when the accessory has disappeared', () => {
      // A removed accessory must not blank the open modal
      const original = component.service
      accessories.accessories.services.length = 0

      accessoryData.next([])

      expect(component.service).toBe(original)
      expect(component.updateCalls).toBe(1)
    })

    it('stops listening once the modal is destroyed', () => {
      fixture.destroy()

      accessoryData.next([])

      expect(component.updateCalls).toBe(0)
    })
  })

  describe('debounced value changes', () => {
    it('waits half a second by default', () => {
      vi.useFakeTimers()
      component.debounce()

      component.changes$.next(1)
      component.changes$.next(2)
      component.changes$.next(3)

      vi.advanceTimersByTime(499)
      expect(component.debounced).toEqual([])

      vi.advanceTimersByTime(1)
      expect(component.debounced).toEqual([3])
    })

    it('honours a shorter window when the child asks for one', () => {
      vi.useFakeTimers()
      component.debounce(50)

      component.changes$.next(7)
      vi.advanceTimersByTime(50)

      expect(component.debounced).toEqual([7])
    })

    it('drops a pending value when the modal closes first', () => {
      // Otherwise a slider nudged and then cancelled still writes to the
      // accessory after the modal has gone
      vi.useFakeTimers()
      component.debounce()

      component.changes$.next(9)
      fixture.destroy()
      vi.advanceTimersByTime(1000)

      expect(component.debounced).toEqual([])
    })
  })

  describe('the error toast', () => {
    it('shows the translated generic message for a developer-only error', () => {
      // Child components used to hardcode English strings like
      // 'Failed to set light brightness'
      component.raiseError(new Error('LevelControl cluster not found'))

      expect(toastr.error).toHaveBeenCalledWith('toast.api_error_generic', 'toast.title_error')
      expect(console.error).toHaveBeenCalled()
    })

    it('shows a message the server supplied', () => {
      component.raiseError({ error: { message: 'Accessory is not responding' } })

      expect(toastr.error).toHaveBeenCalledWith('Accessory is not responding', 'toast.title_error')
    })

    it('logs nothing when called with no error at all', () => {
      component.raiseError()

      expect(console.error).not.toHaveBeenCalled()
      expect(toastr.error).toHaveBeenCalledWith('toast.api_error_generic', 'toast.title_error')
    })
  })

  describe('slider gradients', () => {
    it('paints every slider on the next frame', async () => {
      component.gradient('linear-gradient(90deg, red, blue)')

      // Nothing has happened yet - the work is deferred to a frame callback
      expect((document.querySelector('.noUi-target.first') as HTMLElement).style.background).toBe('')

      await flushFrames()

      expect((document.querySelector('.noUi-target.first') as HTMLElement).style.background).toBe('linear-gradient(90deg, red, blue)')
      expect((document.querySelector('.noUi-target.second') as HTMLElement).style.background).toBe('linear-gradient(90deg, red, blue)')
    })

    it('leaves elements outside the selector alone', async () => {
      component.gradient('linear-gradient(90deg, red, blue)')
      await flushFrames()

      expect((document.querySelector('.other-slider') as HTMLElement).style.background).toBe('')
    })

    it('paints only the sliders a child narrowed to', async () => {
      // Modals with two sliders (a colour one and a brightness one) pass their
      // own selector so the two gradients do not overwrite each other
      component.gradient('linear-gradient(90deg, red, blue)', '.noUi-target.second')
      await flushFrames()

      expect((document.querySelector('.noUi-target.first') as HTMLElement).style.background).toBe('')
      expect((document.querySelector('.noUi-target.second') as HTMLElement).style.background).toBe('linear-gradient(90deg, red, blue)')
    })
  })

  describe('blurring a pressed button', () => {
    it('takes focus off the button that was clicked', () => {
      const button = document.createElement('button')
      document.body.appendChild(button)
      button.focus()
      expect(document.activeElement).toBe(button)

      component.blur({ target: button } as unknown as MouseEvent)

      expect(document.activeElement).not.toBe(button)
      button.remove()
    })
  })
})
