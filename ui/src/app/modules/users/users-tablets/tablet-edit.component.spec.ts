import type { KioskDevice } from '@/app/modules/kiosk/kiosk-devices.service'
import type { ComponentFixture } from '@angular/core/testing'

import { TestBed } from '@angular/core/testing'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { ToastrService } from 'ngx-toastr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { HttpErrorService } from '@/app/core/utilities/http-error.service'
import { KioskDevicesService } from '@/app/modules/kiosk/kiosk-devices.service'
import { provideTestTranslate } from '@/testing/providers'

import { TabletEditComponent } from './tablet-edit.component'

/** Every accessory in the test house has a uniqueId; the scope decides how many are sent */
function resolveFake(scope: { rooms: string[], categories: string[], labels: string[] }): string[] {
  if (scope.rooms.length) {
    return ['a', 'b']
  }
  if (scope.labels.length) {
    return ['c']
  }
  return ['a', 'b', 'c']
}

function device(overrides: Partial<KioskDevice> = {}): KioskDevice {
  return {
    id: 'dev-1',
    name: 'Hall',
    owner: 'admin',
    scope: {
      rooms: ['Kitchen'],
      categories: [],
      subcategories: [],
      labels: [],
    },
    scopeLabel: 'Kitchen',
    allowSensitive: false,
    allowedUniqueIds: ['a', 'b'],
    createdAt: '2026-01-01T00:00:00.000Z',
    paired: true,
    ...overrides,
  }
}

describe('tabletEditComponent', () => {
  let fixture: ComponentFixture<TabletEditComponent>
  let devices: {
    ensureSession: ReturnType<typeof vi.fn>
    releaseSession: ReturnType<typeof vi.fn>
    resolveAllowed: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  let activeModal: { close: ReturnType<typeof vi.fn>, dismiss: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    devices = {
      ensureSession: vi.fn(async () => {}),
      releaseSession: vi.fn(),
      resolveAllowed: vi.fn(resolveFake),
      create: vi.fn(async (input: any) => device({ ...input, id: 'new' })),
      update: vi.fn(async (_id: string, input: any) => device(input)),
    }
    activeModal = {
      close: vi.fn(),
      dismiss: vi.fn(),
    }

    TestBed.configureTestingModule({
      imports: [TabletEditComponent],
      providers: [
        provideTestTranslate(),
        { provide: KioskDevicesService, useValue: devices },
        {
          provide: AccessoriesService,
          useValue: {
            rooms: () => [
              { name: 'Kitchen', services: [] },
              { name: 'Hall', services: [] },
            ],
            labels: () => ({
              c: ['Bedtime'],
            }),
          },
        },
        { provide: NgbActiveModal, useValue: activeModal },
        {
          provide: ToastrService,
          useValue: {
            success: vi.fn(),
            error: vi.fn(),
          },
        },
        {
          provide: HttpErrorService,
          useValue: {
            toToastMessage: () => 'error',
          },
        },
      ],
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function open(options: { device?: KioskDevice, preselectScope?: any } = {}): Promise<TabletEditComponent> {
    fixture = TestBed.createComponent(TabletEditComponent)
    fixture.componentInstance.device = options.device
    fixture.componentInstance.preselectScope = options.preselectScope
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    return fixture.componentInstance
  }

  function button(label: string): HTMLButtonElement {
    const found = [
      ...fixture.nativeElement.querySelectorAll('button'),
    ].find((entry: any) => entry.textContent.trim() === label)
    if (!found) {
      throw new Error(`No button ${label}`)
    }
    return found as HTMLButtonElement
  }

  function scopeInput(): HTMLInputElement {
    return fixture.nativeElement.querySelector('#tablet-scope-label') as HTMLInputElement
  }

  function preview(): string {
    return fixture.nativeElement.querySelector('[role="status"]')?.textContent?.trim() ?? ''
  }

  it('shows every room, category and label as a pill, and the accessories the scope holds', async () => {
    await open()

    expect(button('Kitchen')).toBeDefined()
    expect(button('Hall')).toBeDefined()
    expect(button('accessories.categories.lights')).toBeDefined()
    expect(button('Bedtime')).toBeDefined()
    expect(devices.resolveAllowed).toHaveBeenCalledWith({
      rooms: [],
      categories: [],
      subcategories: [],
      labels: [],
    })
    expect(preview()).toContain('kiosk.tablets.count')
  })

  it('updates the live preview as rooms are picked', async () => {
    const component = await open()

    button('Kitchen').click()
    fixture.detectChanges()

    expect(devices.resolveAllowed).toHaveBeenLastCalledWith(expect.objectContaining({
      rooms: ['Kitchen'],
    }))
    expect((component as any).count()).toBe(2)
  })

  it('shows the subcategory pills under a picked category only', async () => {
    await open()
    const labelsOf = () => [
      ...fixture.nativeElement.querySelectorAll('button'),
    ].map((entry: any) => entry.textContent.trim())
    expect(labelsOf()).not.toContain('accessories.subcategories.onoff')

    button('accessories.categories.lights').click()
    fixture.detectChanges()

    expect(labelsOf()).toContain('accessories.subcategories.onoff')
  })

  it('drops a category subcategories when the category is deselected', async () => {
    const component = await open()
    button('accessories.categories.lights').click()
    fixture.detectChanges()
    button('accessories.subcategories.onoff').click()
    fixture.detectChanges()
    expect((component as any).scope().subcategories).toEqual(['onoff'])

    button('accessories.categories.lights').click()
    fixture.detectChanges()

    expect((component as any).scope().subcategories).toEqual([])
  })

  it('names the scope after its picks, and keeps a name the user typed', async () => {
    await open()

    button('Kitchen').click()
    fixture.detectChanges()
    expect(scopeInput().value).toBe('Kitchen')

    scopeInput().value = 'Upstairs'
    scopeInput().dispatchEvent(new Event('input'))
    button('Hall').click()
    fixture.detectChanges()

    expect(scopeInput().value).toBe('Upstairs')
  })

  it('preselects the scope it is opened with, such as the accessories filter', async () => {
    const component = await open({
      preselectScope: {
        rooms: ['Hall'],
        categories: ['lights'],
        subcategories: [],
        labels: [],
      },
    })

    expect((component as any).scope()).toEqual({
      rooms: ['Hall'],
      categories: ['lights'],
      subcategories: [],
      labels: [],
    })
    expect(scopeInput().value).toBe('Hall · accessories.categories.lights')
  })

  it('saves a new tablet with its scope, label and resolved accessories', async () => {
    await open()
    ;(fixture.componentInstance as any).form.controls.name.setValue('Hall tablet')
    button('Kitchen').click()
    fixture.detectChanges()

    button('form.button_save').click()
    await fixture.whenStable()

    expect(devices.create).toHaveBeenCalledWith({
      name: 'Hall tablet',
      scope: {
        rooms: ['Kitchen'],
        categories: [],
        subcategories: [],
        labels: [],
      },
      scopeLabel: 'Kitchen',
      allowSensitive: false,
      allowedUniqueIds: ['a', 'b'],
    })
    expect(activeModal.close).toHaveBeenCalled()
  })

  it('saves an edited tablet with its own label, and keeps its stored scope to start from', async () => {
    await open({
      device: device(),
    })
    expect(scopeInput().value).toBe('Kitchen')

    scopeInput().value = 'Kitchen downstairs'
    scopeInput().dispatchEvent(new Event('input'))
    button('form.button_save').click()
    await fixture.whenStable()

    expect(devices.update).toHaveBeenCalledWith('dev-1', expect.objectContaining({
      scope: {
        rooms: ['Kitchen'],
        categories: [],
        subcategories: [],
        labels: [],
      },
      scopeLabel: 'Kitchen downstairs',
    }))
  })
})
