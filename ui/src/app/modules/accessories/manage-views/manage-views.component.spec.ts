import type { ComponentFixture } from '@angular/core/testing'

import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslateService } from '@ngx-translate/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { KioskLinksService } from '@/app/modules/kiosk/kiosk-links.service'
import { activeModalStub } from '@/testing'
import { provideTestTranslate } from '@/testing/providers'

import { ManageViewsComponent } from './manage-views.component'

/**
 * The manage views modal. The service is stubbed: each test checks what the modal asks it to do.
 */
describe('manageViewsComponent', () => {
  let fixture: ComponentFixture<ManageViewsComponent>
  let activeModal: ReturnType<typeof activeModalStub>
  let kiosk: { open: ReturnType<typeof vi.fn>, copy: ReturnType<typeof vi.fn> }
  let service: {
    views: ReturnType<typeof signal<any[]>>
    rooms: ReturnType<typeof signal<any[]>>
    isOwnView: ReturnType<typeof vi.fn>
    updateView: ReturnType<typeof vi.fn>
    deleteView: ReturnType<typeof vi.fn>
    reorderViews: ReturnType<typeof vi.fn>
    toggleShare: ReturnType<typeof vi.fn>
  }

  const mine = {
    id: 'v1',
    name: 'Downstairs',
    state: {},
    pinned: ['a1'],
    excluded: [],
    shared: false,
  }
  const theirs = {
    id: 'v2',
    name: 'Alice lights',
    state: {},
    pinned: [],
    excluded: ['b2'],
    shared: true,
    owner: 'alice',
  }

  function create(views: any[] = [mine, theirs]) {
    kiosk = {
      open: vi.fn(async () => true),
      copy: vi.fn(async () => {}),
    }
    service = {
      views: signal(views),
      rooms: signal([
        {
          name: 'Kitchen',
          services: [
            { uniqueId: 'a1', customName: 'Kettle' },
            { uniqueId: 'b2', customName: 'Fan' },
          ],
        },
        {
          name: 'Hall',
          services: [
            { uniqueId: 'c3', serviceName: 'Lamp' },
          ],
        },
      ]),
      isOwnView: vi.fn((view: any) => !view.owner || view.owner === 'me'),
      updateView: vi.fn(() => true),
      deleteView: vi.fn(() => true),
      reorderViews: vi.fn(() => true),
      toggleShare: vi.fn(() => true),
    }
    activeModal = activeModalStub()

    TestBed.configureTestingModule({
      imports: [ManageViewsComponent],
      providers: [
        provideTestTranslate(),
        { provide: AccessoriesService, useValue: service },
        { provide: NgbActiveModal, useValue: activeModal },
        { provide: KioskLinksService, useValue: kiosk },
      ],
    })

    TestBed.inject(TranslateService).setTranslation('en', {
      'accessories.views.shared_by': 'Shared by {{owner}}',
    }, true)

    fixture = TestBed.createComponent(ManageViewsComponent)
    fixture.detectChanges()
    return fixture.componentInstance
  }

  function rows(): HTMLElement[] {
    return [
      ...fixture.nativeElement.querySelectorAll('.accessories-manage-view'),
    ]
  }

  function button(row: HTMLElement, label: string): HTMLButtonElement | undefined {
    return [
      ...row.querySelectorAll('button'),
    ].find(entry => entry.getAttribute('aria-label') === label) as HTMLButtonElement | undefined
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('lists each view with its name and an editable name box when the user owns it', () => {
    create()

    expect(rows()).toHaveLength(2)
    const input = rows()[0].querySelector('input[type="text"]') as HTMLInputElement
    expect(input.value).toBe('Downstairs')
  })

  it('shows a view shared by someone else read-only, with its owner', () => {
    create()

    const row = rows()[1]
    expect(row.querySelector('input[type="text"]')).toBeNull()
    expect(row.textContent).toContain('Alice lights')
    expect(row.textContent).toContain('alice')
    // Its excluded accessory is still listed, but cannot be removed
    expect(row.querySelector('.accessories-view-chip')).not.toBeNull()
    expect(row.querySelector('.accessories-view-chip button')).toBeNull()
  })

  it('renames an own view on change, and puts a blank name back', () => {
    const modal = create()
    const input = rows()[0].querySelector('input[type="text"]') as HTMLInputElement

    input.value = '  Upstairs '
    modal.rename(mine as any, { target: input } as unknown as Event)
    expect(service.updateView).toHaveBeenCalledWith('v1', { name: 'Upstairs' })

    input.value = '   '
    modal.rename(mine as any, { target: input } as unknown as Event)
    expect(input.value).toBe('Downstairs')
    expect(service.updateView).toHaveBeenCalledTimes(1)
  })

  it('moves a view up and down, and disables the moves that cannot happen', () => {
    create([
      mine,
      { ...mine, id: 'v3', name: 'Second' },
    ])
    const first = rows()[0]
    const last = rows()[1]

    expect(button(first, 'accessories.views.move_up')!.disabled).toBe(true)
    expect(button(last, 'accessories.views.move_down')!.disabled).toBe(true)

    button(last, 'accessories.views.move_up')!.click()
    expect(service.reorderViews).toHaveBeenCalledWith('v3', -1)
  })

  it('deletes an own view', () => {
    create()

    button(rows()[0], 'accessories.views.delete')!.click()

    expect(service.deleteView).toHaveBeenCalledWith('v1')
  })

  it('turns sharing on for an own view, and offers no controls on a shared one', () => {
    create()

    const toggle = rows()[0].querySelector('input[role="switch"]') as HTMLInputElement
    toggle.click()
    expect(service.toggleShare).toHaveBeenCalledWith('v1')

    expect(rows()[1].querySelector('input[role="switch"]')).toBeNull()
    expect(button(rows()[1], 'accessories.views.delete')).toBeUndefined()
  })

  it('shows the pinned and excluded accessories as removable chips, by name', () => {
    create()

    const chips = rows()[0].querySelectorAll('.accessories-view-chip')
    expect(chips).toHaveLength(1)
    expect(chips[0].textContent).toContain('Kettle')
  })

  it('removes a pinned accessory from the list', () => {
    create()
    const chip = rows()[0].querySelector('.accessories-view-chip')!
    chip.querySelector('button')!.click()

    expect(service.updateView).toHaveBeenCalledWith('v1', { pinned: [] })
  })

  it('adds an accessory to the excluded list, taking it off the pinned list', () => {
    const modal = create()
    const select = rows()[0].querySelectorAll('select')[1] as HTMLSelectElement
    select.value = 'a1'

    modal.add(mine as any, 'excluded', { target: select } as unknown as Event)

    expect(service.updateView).toHaveBeenCalledWith('v1', {
      excluded: ['a1'],
      pinned: [],
    })
    expect(select.value).toBe('')
  })

  it('offers only the accessories a list does not have yet', () => {
    const modal = create()

    const names = modal.optionsFor(mine as any, 'pinned').map(option => option.name)
    expect(names).toEqual(['Fan', 'Kettle', 'Lamp'].filter(name => name !== 'Kettle'))
  })

  it('closes the modal', () => {
    create()

    fixture.componentInstance.close()

    expect(activeModal.close).toHaveBeenCalled()
  })

  describe('open as kiosk', () => {
    it('opens the view as a kiosk, closing the modal first', () => {
      create()
      const button = fixture.nativeElement.querySelector('.accessories-kiosk-open') as HTMLButtonElement
      button.click()
      expect(activeModal.close).toHaveBeenCalled()
      expect(kiosk.open).toHaveBeenCalledWith('v1')
    })

    it('copies the kiosk link of a view shared with the user too', () => {
      create()
      const copies = [
        ...fixture.nativeElement.querySelectorAll('.accessories-kiosk-copy'),
      ] as HTMLButtonElement[]
      expect(copies.length).toBe(2)
      copies[1].click()
      expect(kiosk.copy).toHaveBeenCalledWith('v2')
    })
  })
})
