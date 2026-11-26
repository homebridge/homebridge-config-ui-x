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
    fixture.componentRef.setInput('variant', 'actions')
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

  /** The option rows in the Filters dropdown: the top-level options, or the subcategories */
  function rows(subcategory = false): HTMLButtonElement[] {
    const row = subcategory ? '.accessories-suboption' : ':not(.accessories-suboption)'
    return [
      ...document.querySelectorAll<HTMLButtonElement>(`.accessories-filters-menu button.accessories-menu-option${row}`),
    ]
  }

  /** The text of an option row, its label and count (the check column is empty when unticked) */
  function rowText(button: HTMLElement): string {
    return [
      ...button.querySelectorAll('span'),
    ].map(span => span.textContent!.trim()).filter(Boolean).join(' ')
  }

  /** A row of the Group and sort menu: section 0 is Group by, section 1 is Sort */
  function sortRow(section: 0 | 1, value: string): HTMLButtonElement {
    const sections = document.querySelectorAll<HTMLElement>('.accessories-sort-menu .accessories-menu-section')
    return sections[section].querySelector<HTMLButtonElement>(`[data-value="${value}"]`)!
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
      'form.button_reset': 'Reset',
      'accessories.toolbar.active_filters': 'active filters',
      'accessories.toolbar.show_hidden_accessories': 'Show hidden accessories',
      'accessories.control.close': 'Close',
      'accessories.toolbar.group_sort': 'Group and sort',
      'accessories.toolbar.group_by': 'Group by',
      'accessories.toolbar.sort_by': 'Sort',
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

      toolbar.onGroupBy('bridge')
      expect(toolbar.filter()).toEqual(expect.objectContaining({ groupBy: 'bridge', sortBy: 'manual' }))

      toolbar.onSortBy('name')
      expect(toolbar.filter()).toEqual(expect.objectContaining({ groupBy: 'bridge', sortBy: 'name' }))

      toolbar.toggleShowHidden()
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
    it('hides the panel footer when no filter is set', () => {
      setup()
      openPanel()

      expect(document.querySelector('.accessories-filters-footer')).toBeNull()
    })

    it('shows Clear all in the panel footer when a filter is set', () => {
      setup({ search: 'kettle' })
      openPanel()

      const clear = document.querySelector<HTMLButtonElement>('.accessories-filters-footer .btn-link')!
      expect(clear.disabled).toBe(false)
      expect(clear.textContent!.trim()).toBe('Clear all')
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
        ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.accessories-sort-menu [role="menuitemradio"][data-value]'),
      ].map(option => option.dataset.value)
      expect(values).toContain('floor')
    })
  })

  describe('group and sort menu', () => {
    function sortMenu(): HTMLElement {
      return fixture.nativeElement.querySelector('.accessories-sort-menu') as HTMLElement
    }

    function openSortMenu(): void {
      ;(fixture.nativeElement.querySelector('.accessories-sort-button') as HTMLButtonElement).click()
      fixture.detectChanges()
    }

    it('opens under its button with a titled header and a close button', () => {
      setup()
      openSortMenu()

      expect(sortMenu().classList.contains('show')).toBe(true)
      expect(sortMenu().querySelector('.accessories-menu-header h5')?.textContent).toContain('Group and sort')
      expect(sortMenu().querySelector('.accessories-menu-header .btn-close')?.getAttribute('aria-label')).toBe('Close')
    })

    it('has no reset footer while grouping and sort are at their defaults', () => {
      setup()
      openSortMenu()

      expect(sortMenu().querySelector('.accessories-filters-footer')).toBeNull()
    })

    it('shows a Reset link in the footer once grouping or sort changes', () => {
      setup()
      openSortMenu()
      sortRow(1, 'name').click()
      fixture.detectChanges()

      const reset = sortMenu().querySelector<HTMLButtonElement>('.accessories-filters-footer .btn-link')!
      expect(reset.textContent!.trim()).toBe('Reset')
    })

    it('resets grouping and sort to the defaults, leaving the filters unchanged', () => {
      const toolbar = setup({
        search: 'kettle',
        categories: ['lights'],
        groupBy: 'floor',
        sortBy: 'name',
      })
      openSortMenu()

      sortMenu().querySelector<HTMLButtonElement>('.accessories-filters-footer .btn-link')!.click()
      fixture.detectChanges()

      expect(toolbar.filter()).toEqual({
        ...DEFAULT_FILTER_STATE,
        search: 'kettle',
        categories: ['lights'],
      })
      expect(sortMenu().querySelector('.accessories-filters-footer')).toBeNull()
    })

    it('lists Group by and Sort as tick rows with uppercase section headings', () => {
      setup()
      openSortMenu()

      const groups = [
        ...sortMenu().querySelectorAll<HTMLElement>('.accessories-menu-section[role="group"]'),
      ]
      expect(groups.map(group => group.querySelector('.accessories-menu-section-title')?.textContent?.trim())).toEqual([
        'Group by',
        'Sort',
      ])
      for (const group of groups) {
        expect(document.getElementById(group.getAttribute('aria-labelledby')!)).not.toBeNull()
        const options = group.querySelectorAll<HTMLButtonElement>('button[role="menuitemradio"]')
        expect(options.length).toBeGreaterThan(0)
        expect(group.querySelector('input')).toBeNull()
      }
    })

    it('sets groupBy and sortBy from the tick rows', () => {
      const toolbar = setup()
      openSortMenu()

      sortRow(0, 'floor').click()
      fixture.detectChanges()
      expect(toolbar.filter().groupBy).toBe('floor')
      expect(sortRow(0, 'floor').getAttribute('aria-checked')).toBe('true')

      sortRow(1, 'name').click()
      fixture.detectChanges()
      expect(toolbar.filter().sortBy).toBe('name')
      expect(sortRow(1, 'name').querySelector('.fa-check')).not.toBeNull()
      expect(sortRow(1, 'manual').querySelector('.fa-check')).toBeNull()
    })

    it('closes on the close button', () => {
      setup()
      openSortMenu()

      ;(sortMenu().querySelector('.accessories-menu-header .btn-close') as HTMLButtonElement).click()
      fixture.detectChanges()

      expect(sortMenu().classList.contains('show')).toBe(false)
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
      expect(fixture.nativeElement.querySelector('.accessories-menu-header h5')?.textContent).toContain('Filters')
    })

    it('stays open while rows are ticked', () => {
      setup()
      openPanel()

      rows()[0].click()
      fixture.detectChanges()

      expect(isOpen()).toBe(true)
    })

    it('closes on the close button', () => {
      setup()
      openPanel()

      ;(fixture.nativeElement.querySelector('.accessories-menu-header .btn-close') as HTMLButtonElement).click()
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
      expect(kitchen().getAttribute('aria-pressed')).toBe('false')
      expect(kitchen().querySelector('.fa-check')).toBeNull()
      expect(kitchen().querySelector('.accessories-pill-count')!.textContent).toContain('3')

      kitchen().click()
      fixture.detectChanges()
      expect(toolbar.filter().rooms).toEqual(['Kitchen'])
      expect(kitchen().getAttribute('aria-pressed')).toBe('true')
      expect(kitchen().querySelector('.fa-check')).not.toBeNull()

      kitchen().click()
      fixture.detectChanges()
      expect(toolbar.filter().rooms).toEqual([])
      expect(kitchen().getAttribute('aria-pressed')).toBe('false')
    })

    it('groups each section, labelled by its heading', () => {
      setup()
      openPanel()

      const groups = [
        ...document.querySelectorAll<HTMLElement>('.accessories-filters-menu .accessories-menu-section[role="group"]'),
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
    it('renders no kiosk button while kiosk mode is hidden', () => {
      setup()

      expect(fixture.nativeElement.querySelector('.accessories-kiosk-button')).toBeNull()
    })

    it('opens the kiosk dialog when it is started, prefilled with the filter', () => {
      const toolbar = setup({
        rooms: ['Kitchen'],
        labels: ['Night'],
      })

      toolbar.openKioskMode()

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
      fixture.componentRef.setInput('variant', 'actions')
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

    function subRows(): HTMLButtonElement[] {
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

  describe('faceted counts', () => {
    it('counts each option under the other filters, search included', () => {
      setup({ search: 'counter' })
      openPanel()

      // Only Counter matches the search, and it is in Kitchen as a light
      const row = (label: string) => rows().find(entry => rowText(entry).includes(label))!
      expect(rowText(row('Kitchen'))).toContain('1')
      expect(rowText(row('Lights'))).toContain('1')
      expect(row('Switches')).toBeUndefined()
    })

    it('does not count an option under its own facet selection', () => {
      const toolbar = setup({
        categories: ['lights'],
        rooms: ['Kitchen'],
      })
      const category = (key: string) => toolbar.facets().find(entry => entry.key === 'categories')!.options.find(option => option.value === key)!
      const room = toolbar.facets().find(entry => entry.key === 'rooms')!.options.find(option => option.value === 'Kitchen')!

      // Lights: ceiling and counter, both in Kitchen. Switches: kettle, in Kitchen.
      expect(category('lights').count).toBe(2)
      expect(category('switches').count).toBe(1)
      // Kitchen under the Lights selection: ceiling and counter
      expect(room.count).toBe(2)
    })

    it('counts a category under the rooms that are selected, not under its own subcategories', () => {
      const toolbar = setup({
        rooms: ['Kitchen'],
      })
      const lights = toolbar.facets().find(entry => entry.key === 'categories')!.options.find(option => option.value === 'lights')!

      expect(lights.count).toBe(2)
    })
  })

  describe('reset', () => {
    it('is hidden while nothing is set', () => {
      setup()

      expect(fixture.nativeElement.querySelector('.accessories-reset-button')).toBeNull()
    })

    it('shows for an active filter, the search, or a changed grouping or sort', () => {
      setup({
        rooms: ['Kitchen'],
      })
      expect(fixture.nativeElement.querySelector('.accessories-reset-button')).not.toBeNull()
    })

    it('shows for search text alone', () => {
      setup({ search: 'kettle' })
      expect(fixture.nativeElement.querySelector('.accessories-reset-button')).not.toBeNull()
    })

    it('shows for a non-default group or sort alone', () => {
      setup({ sortBy: 'name' })
      expect(fixture.nativeElement.querySelector('.accessories-reset-button')).not.toBeNull()
    })

    it('clears the search, filters, and grouping and sort back to the defaults when clicked', () => {
      const toolbar = setup({
        search: 'kettle',
        rooms: ['Kitchen'],
        showHidden: true,
        groupBy: 'floor',
        sortBy: 'name',
      })

      ;(fixture.nativeElement.querySelector('.accessories-reset-button') as HTMLButtonElement).click()
      fixture.detectChanges()

      expect(toolbar.filter()).toEqual(DEFAULT_FILTER_STATE)
      expect(fixture.nativeElement.querySelector('.accessories-reset-button')).toBeNull()
    })
  })

  describe('tick rows', () => {
    it('draws a check only on the selected option, with a fixed check column', () => {
      setup({
        rooms: ['Kitchen'],
      })
      openPanel()

      const kitchen = rows().find(entry => rowText(entry).includes('Kitchen'))!
      const office = rows().find(entry => rowText(entry).includes('Office'))
      expect(kitchen.querySelector('.accessories-check .fa-check.primary-text')).not.toBeNull()
      expect(kitchen.getAttribute('aria-pressed')).toBe('true')
      expect(office).toBeUndefined()
      expect(fixture.nativeElement.querySelectorAll('.accessories-filters-menu input[type="checkbox"]').length).toBe(0)
    })

    it('shows Show hidden accessories as a tick row', () => {
      const toolbar = setup()
      openPanel()

      const hidden = document.querySelector<HTMLButtonElement>('.accessories-filters-menu button[aria-pressed]:not(.accessories-suboption)')
      const row = [
        ...document.querySelectorAll<HTMLButtonElement>('.accessories-filters-menu button.accessories-menu-option'),
      ]
        .find(entry => entry.textContent!.includes('Show hidden accessories'))!
      expect(hidden).not.toBeNull()
      expect(row.getAttribute('aria-pressed')).toBe('false')

      row.click()
      fixture.detectChanges()
      expect(toolbar.filter().showHidden).toBe(true)
      expect(row.getAttribute('aria-pressed')).toBe('true')
    })
  })

  describe('label section', () => {
    it('is left out of the panel when no accessory has a label', () => {
      const toolbar = setup()
      openPanel()

      expect(toolbar.orderedFacets().some(facet => facet.key === 'labels')).toBe(false)
      expect(document.getElementById('accessories-menu-section-labels')).toBeNull()
    })

    it('is shown once an accessory has a label', () => {
      const toolbar = setup()
      fixture.componentRef.setInput('labels', {
        kettle: ['Bedtime'],
      })
      fixture.detectChanges()

      expect(toolbar.orderedFacets().some(facet => facet.key === 'labels')).toBe(true)
    })
  })

  describe('variants', () => {
    it('renders only the search field in the search variant', () => {
      fixture = TestBed.createComponent(AccessoriesToolbarComponent)
      fixture.componentRef.setInput('variant', 'search')
      fixture.componentRef.setInput('filter', DEFAULT_FILTER_STATE)
      fixture.detectChanges()

      expect(fixture.nativeElement.querySelector('input[type="search"]')).not.toBeNull()
      expect(fixture.nativeElement.querySelector('.accessories-filters-button')).toBeNull()
      expect(fixture.nativeElement.querySelector('.accessories-manage-layout-button, [aria-label="accessories.manage_layout"]')).toBeNull()
    })

    it('renders the Filters, Group and sort and Manage layout buttons, and no search field, in the actions variant', () => {
      setup()

      expect(fixture.nativeElement.querySelector('input[type="search"]')).toBeNull()
      expect(fixture.nativeElement.querySelector('.accessories-filters-button')).not.toBeNull()
      expect(fixture.nativeElement.querySelector('.accessories-sort-button')).not.toBeNull()
      expect(fixture.nativeElement.querySelector('[aria-label="accessories.manage_layout"]')).not.toBeNull()
    })
  })
})
