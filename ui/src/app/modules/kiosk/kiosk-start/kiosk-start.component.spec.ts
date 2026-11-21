import type { ComponentFixture } from '@angular/core/testing'

import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { KioskDevicesService } from '@/app/modules/kiosk/kiosk-devices.service'
import { provideTestTranslate } from '@/testing/providers'

import { KioskStartComponent } from './kiosk-start.component'

/** The Kiosk mode dialog: prefilled from the filter, a live count, Start and Copy link */
describe('kioskStartComponent', () => {
  let fixture: ComponentFixture<KioskStartComponent>
  let router: { navigate: ReturnType<typeof vi.fn> }
  let activeModal: { close: ReturnType<typeof vi.fn>, dismiss: ReturnType<typeof vi.fn> }
  let toastr: { success: ReturnType<typeof vi.fn>, error: ReturnType<typeof vi.fn> }
  let writeText: ReturnType<typeof vi.fn>
  let resolveAllowed: ReturnType<typeof vi.fn>

  /** Four accessories in all; a room or label picked narrows them to two */
  function resolve(scope: { rooms: string[], labels: string[] }): string[] {
    return scope.rooms.length || scope.labels.length
      ? ['a', 'b']
      : ['a', 'b', 'c', 'd']
  }

  function setup(preselect?: Record<string, string[]>): void {
    fixture = TestBed.createComponent(KioskStartComponent)
    fixture.componentInstance.preselectScope = preselect as never
    fixture.detectChanges()
  }

  function button(label: string): HTMLButtonElement {
    return [
      ...fixture.nativeElement.querySelectorAll('button'),
    ].find(
      (element: HTMLButtonElement) => element.textContent!.trim() === label,
    ) as HTMLButtonElement
  }

  function pill(label: string): HTMLButtonElement {
    return button(label)
  }

  beforeEach(() => {
    router = {
      navigate: vi.fn(async () => true),
    }
    activeModal = {
      close: vi.fn(),
      dismiss: vi.fn(),
    }
    toastr = {
      success: vi.fn(),
      error: vi.fn(),
    }
    writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    resolveAllowed = vi.fn(resolve)

    TestBed.configureTestingModule({
      imports: [KioskStartComponent],
      providers: [
        provideTestTranslate(),
        { provide: Router, useValue: router },
        { provide: NgbActiveModal, useValue: activeModal },
        { provide: ToastrService, useValue: toastr },
        {
          provide: AccessoriesService,
          useValue: {
            rooms: signal([
              { name: 'Kitchen' },
              { name: 'Hall' },
            ]),
            labels: signal({
              a: ['Night'],
              b: ['Morning'],
            }),
          },
        },
        {
          provide: KioskDevicesService,
          useValue: { resolveAllowed },
        },
      ],
    })
    TestBed.inject(TranslateService).setTranslation('en', {
      'kiosk.start.title': 'Start kiosk mode',
      'kiosk.start.count': '{{count}} accessories',
      'kiosk.start.button': 'Start',
      'kiosk.start.copy_link': 'Copy link',
      'kiosk.link_copied': 'Kiosk link copied',
      'kiosk.link_failed': 'Could not copy the kiosk link',
      'kiosk.tablets.rooms': 'Rooms',
      'kiosk.tablets.categories': 'Categories',
      'kiosk.tablets.labels': 'Labels',
      'toast.title_success': 'Success',
      'toast.title_error': 'Error',
    }, true)
  })

  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('prefills the scope from the filter it opens with and shows the count', () => {
    setup({
      rooms: ['Kitchen'],
      categories: [],
      subcategories: [],
      labels: [],
    })

    expect(pill('Kitchen').getAttribute('aria-pressed')).toBe('true')
    expect(pill('Hall').getAttribute('aria-pressed')).toBe('false')
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent.trim()).toBe('2 accessories')
  })

  it('shows every accessory when nothing is preselected', () => {
    setup()

    expect(fixture.nativeElement.querySelector('[role="status"]').textContent.trim()).toBe('4 accessories')
  })

  it('updates the count as the scope changes', () => {
    setup()

    pill('Night').click()
    fixture.detectChanges()

    expect(resolveAllowed).toHaveBeenLastCalledWith(expect.objectContaining({
      labels: ['Night'],
    }))
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent.trim()).toBe('2 accessories')
  })

  it('starts the kiosk with the scope as repeated query params, then closes', () => {
    setup({
      rooms: ['Kitchen'],
      categories: [],
      subcategories: [],
      labels: [],
    })
    pill('Night').click()
    fixture.detectChanges()

    button('Start').click()

    expect(router.navigate).toHaveBeenCalledWith(['/kiosk'], {
      queryParams: {
        room: ['Kitchen'],
        label: ['Night'],
      },
    })
    expect(activeModal.close).toHaveBeenCalled()
  })

  it('starts an empty scope with no query params', () => {
    setup()

    button('Start').click()

    expect(router.navigate).toHaveBeenCalledWith(['/kiosk'], { queryParams: {} })
  })

  it('copies the kiosk link for the scope and says so', async () => {
    setup({
      rooms: ['Kitchen'],
      categories: [],
      subcategories: [],
      labels: [],
    })

    button('Copy link').click()
    await fixture.whenStable()

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/kiosk?room=Kitchen`)
    expect(toastr.success).toHaveBeenCalledWith('Kiosk link copied', 'Success')
    expect(router.navigate).not.toHaveBeenCalled()
  })

  it('says so when the link cannot be copied', async () => {
    writeText.mockRejectedValueOnce(new Error('denied'))
    setup()

    button('Copy link').click()
    await fixture.whenStable()

    expect(toastr.error).toHaveBeenCalledWith('Could not copy the kiosk link', 'Error')
  })
})
