import type { AccessoryFilterState } from '@/app/core/accessories/filters/accessory-filters'
import type { ComponentFixture } from '@angular/core/testing'

import { TestBed } from '@angular/core/testing'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslateService } from '@ngx-translate/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildBatteryIndex } from '@/app/core/accessories/filters/accessory-battery'
import { DEFAULT_FILTER_STATE } from '@/app/core/accessories/filters/accessory-filters'
import { KioskStartComponent } from '@/app/modules/kiosk/kiosk-start/kiosk-start.component'
import { provideTestTranslate } from '@/testing/providers'

import { AccessoriesToolbarComponent } from './accessories-toolbar.component'

/**
 * The filter, grouping and sort controls on the accessories page.
 *
 * The toolbar holds no state: each test sets the filter as an input and checks
 * what it emits.
 */
describe('accessoriesToolbarComponent', () => {
  let modal: { open: ReturnType<typeof vi.fn> }
  let fixture: ComponentFixture<AccessoriesToolbarComponent>

  /** A service the toolbar can count. Matches the shape the accessories page passes it. */
  function service(uniqueId: string, overrides: Record<string, unknown> = {}): any {
    return {
      uniqueId,
      serviceName: uniqueId,
      customName: uniqueId,
      type: 'Switch',
      hidden: false,
      onDashboard: false,
      instance: { username: '0E:11:11:11:11:11', name: 'Homebridge' },
      ...overrides,
    }
  }

  const rooms = [
    {
      name: 'Kitchen',
      services: [
        service('kettle', { customName: 'Kettle' }),
        service('ceiling', { type: 'Lightbulb', customName: 'Ceiling' }),
        service('counter', {
          type: 'Lightbulb',
          customName: 'Counter',
          instance: { username: 'BB:22', name: 'Hue' },
        }),
      ],
    },
    {
      name: 'Office',
      services: [
        service('hidden', { hidden: true, type: 'Switch' }),
      ],
    },
  ]

  /**
   * Build the toolbar with the given inputs.
   * @param filter - the filter the toolbar shows
   * @param options - the other inputs
   * @param options.shown - accessories in the result
   * @param options.total - accessories on the page
   */
  function setup(filter: Partial<AccessoryFilterState> = {}, options: { shown?: number, total?: number } = {}) {
    fixture = TestBed.createComponent(AccessoriesToolbarComponent)
    fixture.componentRef.setInput('filter', {
      ...DEFAULT_FILTER_STATE,
      ...filter,
    })
    fixture.componentRef.setInput('rooms', rooms)
    fixture.componentRef.setInput('bridges', ['Homebridge', 'Hue'])
    fixture.componentRef.setInput('batteryIndex', buildBatteryIndex(rooms.flatMap(room => room.services)))
    fixture.componentRef.setInput('shown', options.shown ?? 2)
    fixture.componentRef.setInput('total', options.total ?? 3)
    fixture.detectChanges()

    return fixture.componentInstance
  }

  /** The option rows in the Filters dropdown: the checkboxes of the top-level options, or of the subcategories */
  function rows(subcategory = false): HTMLInputElement[] {
    const row = subcategory ? '.accessories-suboption' : ':not(.accessories-suboption)'
    return [
      ...document.querySelectorAll<HTMLInputElement>(`.accessories-filters-menu .accessories-option${row} input[type="checkbox"]`),
    ]
  }

  /** The text of an option row, its label and count */
  function rowText(input: HTMLInputElement): string {
    return [
      ...input.closest('.form-check')!.querySelectorAll('span'),
    ].map(span => span.textContent!.trim()).join(' ')
  }

  function openPanel(): void {
    ;(fixture.nativeElement.querySelector('.accessories-filters-button') as HTMLButtonElement).click()
    fixture.detectChanges()
  }

  beforeEach(() => {
    modal = {
      open: vi.fn(() => ({
        componentInstance: {},
        result: new Promise(() => {}),
      })),
    }
    TestBed.configureTestingModule({
      imports: [AccessoriesToolbarComponent],
      providers: [
        provideTestTranslate(),
        { provide: NgbModal, useValue: modal },
      ],
    })

    // The page's own strings, so the assertions read like the screen
    TestBed.inject(TranslateService).setTranslation('en', {
      'accessories.toolbar.filters_summary': 'Filters, showing {{shown}} of {{total}}',
      'accessories.toolbar.filters_summary_active': 'Filters, {{count}} active, showing {{shown}} of {{total}}',
      'accessories.toolbar.filters': 'Filters',
      'accessories.toolbar.clear': 'Clear',
      'accessories.toolbar.clear_all': 'Clear all',
      'accessories.toolbar.active_filters': 'active filters',
      'accessories.toolbar.show_count': 'Show {{count}} accessories',
      'accessories.toolbar.show_hidden_accessories': 'Show hidden accessories',
      'accessories.categories.lights': 'Lights',
      'accessories.subcategories.onoff': 'On/off',
      'accessories.subcategories.dimmable': 'Dimmable',
      'accessories.subcategories.thermostat': 'Thermostat',
      'accessories.subcategories.group_lights': 'Light types',
    }, true)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  describe('changing the filter', () => {
    it('waits for the typing to stop before it applies a search', () => {
      vi.useFakeTimers()
      const toolbar = setup()

      toolbar.onSearch('ket')
      toolbar.onSearch('kettle')
      vi.advanceTimersByTime(149)
      expect(toolbar.filter().search).toBe('')

      vi.advanceTimersByTime(1)
      expect(toolbar.filter().search).toBe('kettle')
    })

    it('adds a value to a multi-select filter, then removes it again', () => {
      const toolbar = setup({
        categories: ['switches'],
      })

      toolbar.toggleValue('categories', 'lights')
      expect(toolbar.filter().categories).toEqual(['switches', 'lights'])

      toolbar.toggleValue('categories', 'switches')
      expect(toolbar.filter().categories).toEqual(['lights'])
    })

    it('keeps the grouping, sort and hidden setting the user picks', () => {
      const toolbar = setup()

      toolbar.onGroupBy({
        target: { value: 'bridge' },
      } as unknown as Event)
      expect(toolbar.filter()).toEqual(expect.objectContaining({ groupBy: 'bridge', sortBy: 'manual' }))

      toolbar.onSortBy({
        target: { value: 'battery' },
      } as unknown as Event)
      expect(toolbar.filter()).toEqual(expect.objectContaining({ groupBy: 'bridge', sortBy: 'battery' }))

      toolbar.onShowHidden({
        target: { checked: true },
      } as unknown as Event)
      expect(toolbar.filter().showHidden).toBe(true)
    })
  })

  describe('counts', () => {
    it('shows the count beside each option, so the user sees what a choice would show', () => {
      setup()
      openPanel()

      // Hidden accessories are not counted until the user asks for them
      const row = (label: string) => rows().find(entry => rowText(entry).includes(label))
      expect(rowText(row('Lights')!)).toContain('2')
      expect(rowText(row('Kitchen')!)).toContain('3')
      // Office holds only a hidden accessory, so it has no option until hidden ones are shown
      expect(row('Office')).toBeUndefined()
    })

    it('puts how many accessories are on screen out of the total in the Filters button label', () => {
      setup({}, { shown: 2, total: 3 })

      const button = fixture.nativeElement.querySelector('.accessories-filters-button') as HTMLButtonElement
      expect(button.getAttribute('aria-label')).toBe('Filters, showing 2 of 3')
    })

    it('adds the active filter count to the Filters button label', () => {
      setup({
        categories: ['lights'],
      }, { shown: 2, total: 3 })

      const button = fixture.nativeElement.querySelector('.accessories-filters-button') as HTMLButtonElement
      expect(button.getAttribute('aria-label')).toBe('Filters, 1 active, showing 2 of 3')
    })
  })

  describe('clearing', () => {
    it('disables Clear all in the panel footer when no filter is set', () => {
      setup()
      openPanel()

      const clear = document.querySelector<HTMLButtonElement>('.accessories-filters-footer .btn-link')!
      expect(clear.disabled).toBe(true)
    })

    it('enables Clear all in the panel footer when a filter is set', () => {
      setup({ search: 'kettle' })
      openPanel()

      const clear = document.querySelector<HTMLButtonElement>('.accessories-filters-footer .btn-link')!
      expect(clear.disabled).toBe(false)
    })

    it('clears every filter but keeps the grouping and sort the user picked', () => {
      const toolbar = setup({
        search: 'kettle',
        categories: ['lights'],
        showHidden: true,
        groupBy: 'category',
        sortBy: 'name',
      })

      toolbar.clear()

      expect(toolbar.filter()).toEqual({
        ...DEFAULT_FILTER_STATE,
        groupBy: 'category',
        sortBy: 'name',
      })
    })
  })

  describe('labels and floors', () => {
    it('offers a label facet, counting the accessories with each label', () => {
      const toolbar = setup()
      fixture.componentRef.setInput('labels', {
        kettle: ['Bedtime'],
        ceiling: ['Bedtime', 'Guest'],
      })
      fixture.detectChanges()

      const facet = toolbar.facets().find(entry => entry.key === 'labels')!
      expect(facet.options.map(option => [option.value, option.count])).toEqual([
        ['Bedtime', 2],
        ['Guest', 1],
      ])
    })

    it('filters by a label', () => {
      const toolbar = setup()
      fixture.componentRef.setInput('labels', {
        kettle: ['Bedtime'],
      })
      fixture.detectChanges()

      toolbar.toggleValue('labels', 'Bedtime')

      expect(toolbar.filter()).toEqual(expect.objectContaining({
        labels: ['Bedtime'],
      }))
    })

    it('offers Floor as a group-by option', () => {
      setup()

      const values = [
        ...fixture.nativeElement.querySelectorAll('input[name="accessories-group-by"]'),
      ].map((option: any) => option.value)
      expect(values).toContain('floor')
    })
  })

  describe('filter panel', () => {
    /** Whether the Filters dropdown is open */
    function isOpen(): boolean {
      return (fixture.nativeElement.querySelector('.accessories-filters-menu') as HTMLElement).classList.contains('show')
    }

    it('opens a Filters dropdown under its button, not a side panel', () => {
      setup()
      expect(isOpen()).toBe(false)
      expect(document.querySelector('.offcanvas')).toBeNull()

      openPanel()

      const button = fixture.nativeElement.querySelector('.accessories-filters-button') as HTMLButtonElement
      expect(isOpen()).toBe(true)
      expect(button.getAttribute('aria-expanded')).toBe('true')
      expect(fixture.nativeElement.querySelector('.accessories-filters-header h5')?.textContent).toContain('Filters')
    })

    it('stays open while rows are ticked', () => {
      setup()
      openPanel()

      rows()[0].click()
      fixture.detectChanges()

      expect(isOpen()).toBe(true)
    })

    it('closes on Show N accessories', () => {
      setup()
      openPanel()

      ;(fixture.nativeElement.querySelector('.accessories-filters-footer .btn-primary') as HTMLButtonElement).click()
      fixture.detectChanges()

      expect(isOpen()).toBe(false)
    })

    it('closes on Escape', () => {
      setup()
      openPanel()

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      fixture.detectChanges()

      expect(isOpen()).toBe(false)
    })

    it('closes on a click outside the dropdown', async () => {
      setup()
      openPanel()

      // ng-bootstrap closes on a mouse press outside, released after a tick
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
      await new Promise(resolve => setTimeout(resolve, 0))
      fixture.detectChanges()

      expect(isOpen()).toBe(false)
    })

    it('ticks a row on and off, multi-select, and labels it with its count', () => {
      const toolbar = setup()
      openPanel()

      const kitchen = () => rows().find(entry => rowText(entry).includes('Kitchen'))!
      expect(kitchen().type).toBe('checkbox')
      expect(kitchen().checked).toBe(false)
      expect(kitchen().labels![0].textContent).toContain('3')

      kitchen().click()
      fixture.detectChanges()
      expect(toolbar.filter().rooms).toEqual(['Kitchen'])
      expect(kitchen().checked).toBe(true)

      kitchen().click()
      fixture.detectChanges()
      expect(toolbar.filter().rooms).toEqual([])
      expect(kitchen().checked).toBe(false)
    })

    it('groups each section, labelled by its heading', () => {
      setup()
      openPanel()

      const groups = [
        ...document.querySelectorAll<HTMLElement>('.accessories-filters-menu .accessories-facet[role="group"]'),
      ]
      expect(groups.length).toBeGreaterThan(0)
      for (const group of groups) {
        expect(document.getElementById(group.getAttribute('aria-labelledby')!)).not.toBeNull()
      }
    })

    it('shows the number of active filters on the button, with visually hidden text', () => {
      setup({
        categories: ['lights'],
        showHidden: true,
      })

      const badge = fixture.nativeElement.querySelector('.accessories-filter-badge') as HTMLElement
      expect(badge.textContent!.replace(/\s+/g, ' ').trim()).toBe('2 active filters')
      expect(badge.querySelector('.visually-hidden')).not.toBeNull()
    })

    it('clears every filter, search included, when Clear all is used', () => {
      const toolbar = setup({
        categories: ['lights'],
        search: 'kettle',
      })

      toolbar.clear()

      expect(toolbar.filter()).toEqual(DEFAULT_FILTER_STATE)
    })

    it('collapses a long section behind Show all, and keeps selected options visible', () => {
      const toolbar = setup({
        labels: ['L8'],
      })
      const many = Array.from({ length: 10 }, (_, index) => service(`item${index}`))
      fixture.componentRef.setInput('rooms', [
        { name: 'Hall', services: many },
      ])
      fixture.componentRef.setInput('labels', Object.fromEntries(
        many.map((entry, index) => [
          entry.uniqueId,
          [`L${index}`],
        ]),
      ))
      fixture.detectChanges()

      const facet = toolbar.orderedFacets().find(entry => entry.key === 'labels')!
      expect(facet.options.length).toBe(10)
      expect(toolbar.visibleOptions(facet).map(option => option.value)).toContain('L8')
      expect(toolbar.visibleOptions(facet).length).toBe(9)

      toolbar.toggleExpanded('labels')
      expect(toolbar.visibleOptions(facet).length).toBe(10)
    })
  })

  describe('manage layout', () => {
    it('emits the manage layout toggle', () => {
      const toolbar = setup()
      const spy = vi.fn()
      toolbar.manageLayoutToggle.subscribe(spy)

      ;(fixture.nativeElement.querySelector('[aria-label="accessories.manage_layout"]') as HTMLButtonElement).click()

      expect(spy).toHaveBeenCalledTimes(1)
    })

    it('reports manage layout as pressed', () => {
      setup()
      fixture.componentRef.setInput('manageLayoutActive', true)
      fixture.detectChanges()

      const manage = fixture.nativeElement.querySelector('[aria-label="accessories.manage_layout"]') as HTMLButtonElement
      expect(manage.getAttribute('aria-pressed')).toBe('true')
    })
  })

  describe('kiosk mode', () => {
    it('opens the kiosk dialog from the top bar, prefilled with the filter', () => {
      setup({
        rooms: ['Kitchen'],
        labels: ['Night'],
      })

      ;(fixture.nativeElement.querySelector('.accessories-kiosk-button') as HTMLButtonElement).click()

      expect(modal.open).toHaveBeenCalledWith(KioskStartComponent, expect.anything())
      expect(modal.open.mock.results[0].value.componentInstance.preselectScope).toEqual({
        rooms: ['Kitchen'],
        categories: [],
        subcategories: [],
        labels: ['Night'],
      })
    })

    it('offers no tablet pairing on the accessories page', () => {
      setup()
      openPanel()

      expect(document.body.textContent).not.toContain('Pair a tablet')
    })
  })

  describe('subcategories', () => {
    /** Accessories in the kitchen: two lights (on/off and dimmable), one thermostat, one motion sensor */
    const subRooms = [
      {
        name: 'Kitchen',
        services: [
          service('plain', { type: 'Lightbulb', customName: 'Plain' }),
          service('dim', {
            type: 'Lightbulb',
            customName: 'Dim',
            serviceCharacteristics: [
              { type: 'Brightness', value: 50 },
            ],
          }),
          service('heat', { type: 'Thermostat', customName: 'Heat' }),
          service('motion', { type: 'MotionSensor', customName: 'Motion' }),
        ],
      },
    ]

    function setupSub(filter: Partial<AccessoryFilterState>) {
      fixture = TestBed.createComponent(AccessoriesToolbarComponent)
      fixture.componentRef.setInput('filter', {
        ...DEFAULT_FILTER_STATE,
        ...filter,
      })
      fixture.componentRef.setInput('rooms', subRooms)
      fixture.componentRef.setInput('bridges', ['Homebridge'])
      fixture.componentRef.setInput('batteryIndex', new Map())
      fixture.detectChanges()
      return fixture.componentInstance
    }

    function subRows(): HTMLInputElement[] {
      return rows(true)
    }

    beforeEach(() => {
      TestBed.inject(TranslateService).setTranslation('en', {
        'accessories.subcategories.onoff': 'On/off',
        'accessories.subcategories.dimmable': 'Dimmable',
        'accessories.subcategories.group_lights': 'Light types',
      }, true)
    })

    it('shows the subcategory rows beneath a selected category that has two or more kinds', () => {
      setupSub({
        categories: ['lights'],
      })
      openPanel()

      const labels = subRows().map(rowText)
      expect(labels).toEqual(['On/off 1', 'Dimmable 1'])
      expect(document.querySelector('.accessories-subcategories')!.textContent).toContain('Light types')
    })

    it('does not show subcategory rows for an unselected category', () => {
      setupSub({})
      openPanel()

      expect(subRows()).toEqual([])
    })

    it('does not show subcategory rows when the category has only one kind in the data', () => {
      setupSub({
        categories: ['climate'],
      })
      openPanel()

      expect(subRows()).toEqual([])
    })

    it('narrows the result to the picked subcategory', () => {
      const toolbar = setupSub({
        categories: ['lights'],
      })
      openPanel()

      subRows().find(entry => rowText(entry).includes('Dimmable'))!.click()
      fixture.detectChanges()

      expect(toolbar.filter().subcategories).toEqual(['dimmable'])
      expect(toolbar.filterCount()).toBe(2)
    })

    it('clears a subcategory when its category is deselected', () => {
      const toolbar = setupSub({
        categories: ['lights', 'climate'],
        subcategories: ['dimmable', 'thermostat'],
      })

      toolbar.toggleValue('categories', 'lights')

      expect(toolbar.filter().categories).toEqual(['climate'])
      expect(toolbar.filter().subcategories).toEqual(['thermostat'])
    })
  })
})
