import type { AccessoryFilterState } from '@/app/core/accessories/filters/accessory-filters'
import type { ComponentFixture } from '@angular/core/testing'

import { TestBed } from '@angular/core/testing'
import { TranslateService } from '@ngx-translate/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildBatteryIndex } from '@/app/core/accessories/filters/accessory-battery'
import { DEFAULT_FILTER_STATE } from '@/app/core/accessories/filters/accessory-filters'
import { BUILT_IN_VIEWS } from '@/app/core/accessories/filters/accessory-views'
import { AuthService } from '@/app/core/auth/auth.service'
import { KioskLinksService } from '@/app/modules/kiosk/kiosk-links.service'
import { provideTestTranslate } from '@/testing/providers'

import { AccessoriesToolbarComponent } from './accessories-toolbar.component'

/**
 * The filter, grouping and sort controls on the accessories page.
 *
 * The toolbar holds no state: each test sets the filter as an input and checks
 * what it emits.
 */
describe('accessoriesToolbarComponent', () => {
  let kiosk: { open: ReturnType<typeof vi.fn>, copy: ReturnType<typeof vi.fn> }
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

  /** The pills in the open filter panel (the panel renders outside the fixture) */
  function pills(): HTMLButtonElement[] {
    return [
      ...document.querySelectorAll<HTMLButtonElement>('.accessories-filters-panel .accessories-pill'),
    ]
  }

  function openPanel(): void {
    ;(fixture.nativeElement.querySelector('.accessories-filters-button') as HTMLButtonElement).click()
    fixture.detectChanges()
  }

  /** The view pills in the open filter panel */
  function viewPills(): HTMLButtonElement[] {
    return [
      ...document.querySelectorAll<HTMLButtonElement>('.accessories-filters-panel .accessories-view-pill'),
    ]
  }

  function viewButton(label: string): HTMLButtonElement {
    return viewPills().find(button => button.textContent!.replace(/\s+/g, ' ').trim().startsWith(label)) as HTMLButtonElement
  }

  /** Open the Views menu in the panel, and return its open items */
  function viewsMenuItems(): HTMLButtonElement[] {
    ;(document.querySelector('.accessories-filters-panel .accessories-views-menu') as HTMLButtonElement).click()
    fixture.detectChanges()
    return [
      ...document.querySelectorAll<HTMLButtonElement>('.dropdown-menu.show .dropdown-item'),
    ]
  }

  function menuItem(label: string): HTMLButtonElement | undefined {
    return viewsMenuItems().find(item => item.textContent!.trim() === label)
  }

  beforeEach(() => {
    kiosk = {
      open: vi.fn(async () => true),
      copy: vi.fn(async () => {}),
    }
    TestBed.configureTestingModule({
      imports: [AccessoriesToolbarComponent],
      providers: [
        {
          provide: AuthService,
          useValue: {
            user: { admin: false },
          },
        },
        provideTestTranslate(),
        { provide: KioskLinksService, useValue: kiosk },
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
      'accessories.views.lights': 'Lights',
      'accessories.views.all': 'All',
      'accessories.views.manage': 'Manage views',
      'accessories.views.save': 'Save as view',
      'accessories.kiosk.open': 'Open as kiosk',
      'accessories.kiosk.copy_link': 'Copy kiosk link',
      'accessories.subcategories.onoff': 'On/off',
      'accessories.subcategories.dimmable': 'Dimmable',
      'accessories.subcategories.thermostat': 'Thermostat',
      'accessories.subcategories.group_lights': 'Light types',
    }, true)
  })

  afterEach(async () => {
    // Close a panel a test left open, and let its close animation finish before the TestBed is torn down
    if (document.querySelector('.offcanvas')) {
      fixture?.componentInstance.closeFilters()
      await new Promise(resolve => setTimeout(resolve, 400))
    }
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
      const pill = (label: string) => pills().find(entry => entry.textContent!.includes(label))
      expect(pill('Lights')?.textContent).toContain('2')
      expect(pill('Kitchen')?.textContent).toContain('3')
      // Office holds only a hidden accessory, so it has no option until hidden ones are shown
      expect(pill('Office')).toBeUndefined()
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

      const clear = document.querySelector<HTMLButtonElement>('.offcanvas-footer .btn-link')!
      expect(clear.disabled).toBe(true)
    })

    it('enables Clear all in the panel footer when a filter is set', () => {
      setup({ search: 'kettle' })
      openPanel()

      const clear = document.querySelector<HTMLButtonElement>('.offcanvas-footer .btn-link')!
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

  describe('built-in views', () => {
    it('lists All and every built-in view as pills in the Views section of the panel', () => {
      setup()
      openPanel()

      const labels = viewPills().map(button => button.textContent!.trim())
      expect(labels[0]).toBe('All')
      expect(labels.length).toBe(BUILT_IN_VIEWS.length + 1)
      expect(fixture.nativeElement.querySelector('.accessories-views')).toBeNull()
    })

    it('applies a view on top of a cleared filter', () => {
      const toolbar = setup({
        search: 'x',
        rooms: ['Office'],
      })
      const lights = BUILT_IN_VIEWS.find(view => view.id === 'lights')!

      toolbar.applyView(lights)

      expect(toolbar.filter()).toEqual(expect.objectContaining({
        search: '',
        rooms: [],
        categories: ['lights'],
      }))
    })

    it('applies the batteries view by its battery filter and sort', () => {
      const toolbar = setup()
      const batteries = BUILT_IN_VIEWS.find(view => view.id === 'batteries')!

      toolbar.applyView(batteries)

      expect(toolbar.filter()).toEqual(expect.objectContaining({
        battery: ['any'],
        sortBy: 'battery',
      }))
    })

    it('All clears the filter', () => {
      const toolbar = setup({
        categories: ['lights'],
      })

      toolbar.applyView(null)

      expect(toolbar.filter().categories).toEqual([])
    })

    it('marks the view that matches the filter as active', () => {
      const toolbar = setup({
        categories: ['climate'],
      })
      expect(toolbar.activeView()).toBe('climate')

      fixture.componentRef.setInput('filter', { ...DEFAULT_FILTER_STATE })
      fixture.detectChanges()
      expect(toolbar.activeView()).toBe('all')

      fixture.componentRef.setInput('filter', { ...DEFAULT_FILTER_STATE, search: 'x' })
      fixture.detectChanges()
      expect(toolbar.activeView()).toBeNull()
    })

    it('shows the matching view as pressed', () => {
      setup({
        categories: ['lights'],
      })
      openPanel()

      expect(viewButton('Lights')?.getAttribute('aria-pressed')).toBe('true')
      expect(viewButton('All')?.getAttribute('aria-pressed')).toBe('false')
    })
  })

  describe('saved views', () => {
    const ownView = {
      id: 'v1',
      name: 'Downstairs',
      state: {
        groupBy: 'floor' as const,
        rooms: ['Kitchen'],
      },
      pinned: [],
      excluded: [],
      shared: true,
    }
    const aliceView = {
      id: 'v2',
      name: 'Alice lights',
      state: {
        categories: ['lights' as const],
      },
      shared: true,
      owner: 'alice',
    }

    beforeEach(() => {
      TestBed.inject(TranslateService).setTranslation('en', {
        'accessories.views.shared_by': 'Shared by {{owner}}',
        'accessories.views.save': 'Save as view',
        'accessories.views.manage': 'Manage views',
      }, true)
    })

    function pill(label: string): HTMLButtonElement | undefined {
      return [
        ...document.querySelectorAll<HTMLButtonElement>('.accessories-filters-panel .accessories-custom-view'),
      ].find(button => button.textContent!.includes(label))
    }

    it('lists the custom views after the built-in ones', () => {
      setup()
      fixture.componentRef.setInput('customViews', [ownView, aliceView])
      fixture.detectChanges()
      openPanel()

      const labels = viewPills().map(button => button.textContent!.replace(/\s+/g, ' ').trim())
      expect(labels.slice(-2)).toEqual(['Downstairs', 'Alice lights Shared by alice'])
    })

    it('names the owner of a view shared with the user', () => {
      setup()
      fixture.componentRef.setInput('username', 'bob')
      fixture.componentRef.setInput('customViews', [ownView, aliceView])
      fixture.detectChanges()
      openPanel()

      expect(pill('Alice lights')!.textContent).toContain('Shared by alice')
      expect(pill('Alice lights')!.querySelector('.fa-share-nodes')).not.toBeNull()
      expect(pill('Downstairs')!.textContent).not.toContain('Shared by')
    })

    it('marks the active custom view, and no built-in view', () => {
      setup()
      fixture.componentRef.setInput('customViews', [ownView])
      fixture.componentRef.setInput('activeViewId', 'v1')
      fixture.detectChanges()
      openPanel()

      expect(pill('Downstairs')!.getAttribute('aria-pressed')).toBe('true')
      expect(viewButton('All')!.getAttribute('aria-pressed')).toBe('false')
    })

    it('applies a custom view on top of a cleared filter, and reports which view', () => {
      const toolbar = setup({
        search: 'x',
        rooms: ['Office'],
      })
      fixture.componentRef.setInput('customViews', [ownView])
      fixture.detectChanges()
      openPanel()
      const selected = vi.fn()
      toolbar.viewSelect.subscribe(selected)

      pill('Downstairs')!.click()

      expect(toolbar.filter()).toEqual(expect.objectContaining({
        groupBy: 'floor',
        rooms: ['Kitchen'],
        search: '',
      }))
      expect(selected).toHaveBeenCalledWith('v1')
    })

    it('reports a built-in view as no custom view', () => {
      const toolbar = setup()
      const selected = vi.fn()
      toolbar.viewSelect.subscribe(selected)

      toolbar.applyView(null)

      expect(selected).toHaveBeenCalledWith(null)
    })

    it('offers Save as view in the Views menu of the panel', () => {
      const toolbar = setup({ search: 'kettle' })
      openPanel()
      const save = menuItem('Save as view')
      expect(save).toBeDefined()

      save!.click()
      fixture.detectChanges()
      expect(toolbar.saveFormOpen()).toBe(true)
    })

    it('names and saves a view from the inline form, and closes the form', () => {
      const toolbar = setup({ search: 'kettle' })
      const saved = vi.fn()
      toolbar.saveView.subscribe(saved)
      openPanel()

      toolbar.openSaveView()
      fixture.detectChanges()
      expect(document.querySelector('.accessories-filters-panel .accessories-view-name')).not.toBeNull()

      toolbar.onViewNameInput({
        target: { value: '  Kettles ' },
      } as unknown as Event)
      toolbar.confirmSaveView()
      fixture.detectChanges()

      expect(saved).toHaveBeenCalledWith('Kettles')
      expect(document.querySelector('.accessories-view-name')).toBeNull()
    })

    it('does not save a blank name', () => {
      const toolbar = setup({ search: 'kettle' })
      const saved = vi.fn()
      toolbar.saveView.subscribe(saved)

      toolbar.openSaveView()
      toolbar.onViewNameInput({
        target: { value: '   ' },
      } as unknown as Event)
      toolbar.confirmSaveView()

      expect(saved).not.toHaveBeenCalled()
      expect(toolbar.saveFormOpen()).toBe(true)
    })

    it('opens the manage views modal from the Views menu', () => {
      const toolbar = setup()
      const opened = vi.fn()
      toolbar.manageViews.subscribe(opened)
      openPanel()

      menuItem('Manage views')!.click()

      expect(opened).toHaveBeenCalledTimes(1)
    })

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
    it('opens a slide-out Filters panel from its button', () => {
      setup()
      expect(document.querySelector('.accessories-filters-panel')).toBeNull()

      openPanel()

      const panel = document.querySelector('.accessories-filters-panel') as HTMLElement
      expect(panel).not.toBeNull()
      expect(panel.querySelector('.offcanvas-title')?.textContent).toContain('Filters')
    })

    it('toggles a pill on and off, and reports it with aria-pressed', () => {
      const toolbar = setup()
      openPanel()

      const kitchen = () => pills().find(entry => entry.textContent!.includes('Kitchen'))!
      expect(kitchen().getAttribute('aria-pressed')).toBe('false')

      kitchen().click()
      fixture.detectChanges()
      expect(toolbar.filter().rooms).toEqual(['Kitchen'])
      expect(kitchen().getAttribute('aria-pressed')).toBe('true')

      kitchen().click()
      fixture.detectChanges()
      expect(toolbar.filter().rooms).toEqual([])
      expect(kitchen().getAttribute('aria-pressed')).toBe('false')
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

  describe('manage layout and select', () => {
    it('emits the manage layout toggle', () => {
      const toolbar = setup()
      const spy = vi.fn()
      toolbar.manageLayoutToggle.subscribe(spy)

      ;(fixture.nativeElement.querySelector('[aria-label="accessories.manage_layout"]') as HTMLButtonElement).click()

      expect(spy).toHaveBeenCalledTimes(1)
    })

    it('reports manage layout as pressed and stops select from being used', () => {
      setup()
      fixture.componentRef.setInput('manageLayoutActive', true)
      fixture.detectChanges()

      const manage = fixture.nativeElement.querySelector('[aria-label="accessories.manage_layout"]') as HTMLButtonElement
      const select = fixture.nativeElement.querySelector('[aria-label="accessories.toolbar.select"]') as HTMLButtonElement
      expect(manage.getAttribute('aria-pressed')).toBe('true')
      expect(select.disabled).toBe(true)
    })

    it('emits the select toggle', () => {
      const toolbar = setup()
      const spy = vi.fn()
      toolbar.selectToggle.subscribe(spy)

      ;(fixture.nativeElement.querySelector('[aria-label="accessories.toolbar.select"]') as HTMLButtonElement).click()

      expect(spy).toHaveBeenCalledTimes(1)
    })
  })

  describe('open as kiosk', () => {
    function kioskItem(label: string): HTMLButtonElement | undefined {
      openPanel()
      return menuItem(label)
    }

    it('opens the active built-in view as a kiosk from the Views menu', () => {
      setup({
        categories: ['climate'],
      })

      kioskItem('Open as kiosk')!.click()

      expect(kiosk.open).toHaveBeenCalledWith('climate')
    })

    it('copies the kiosk link of the active saved view', () => {
      const toolbar = setup({}, {})
      fixture.componentRef.setInput('customViews', [
        { id: 'v9', name: 'Hall', state: {} },
      ])
      fixture.componentRef.setInput('activeViewId', 'v9')
      fixture.detectChanges()
      expect(toolbar.kioskViewId()).toBe('v9')

      kioskItem('Copy kiosk link')!.click()

      expect(kiosk.copy).toHaveBeenCalledWith('v9')
    })

    it('offers no kiosk items when nothing matches a view', () => {
      setup({ search: 'kettle' })
      openPanel()

      expect(menuItem('Open as kiosk')).toBeUndefined()
      expect(menuItem('Copy kiosk link')).toBeUndefined()
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

    function subPills(): HTMLButtonElement[] {
      return [
        ...document.querySelectorAll<HTMLButtonElement>('.accessories-filters-panel .accessories-subpill'),
      ]
    }

    beforeEach(() => {
      TestBed.inject(TranslateService).setTranslation('en', {
        'accessories.subcategories.onoff': 'On/off',
        'accessories.subcategories.dimmable': 'Dimmable',
        'accessories.subcategories.group_lights': 'Light types',
      }, true)
    })

    it('shows the subcategory pills beneath a selected category that has two or more kinds', () => {
      setupSub({
        categories: ['lights'],
      })
      openPanel()

      const labels = subPills().map(button => button.textContent!.replace(/\s+/g, ' ').trim())
      expect(labels).toEqual(['On/off 1', 'Dimmable 1'])
      expect(document.querySelector('.accessories-subcategories')!.textContent).toContain('Light types')
    })

    it('does not show subcategory pills for an unselected category', () => {
      setupSub({})
      openPanel()

      expect(subPills()).toEqual([])
    })

    it('does not show subcategory pills when the category has only one kind in the data', () => {
      setupSub({
        categories: ['climate'],
      })
      openPanel()

      expect(subPills()).toEqual([])
    })

    it('narrows the result to the picked subcategory', () => {
      const toolbar = setupSub({
        categories: ['lights'],
      })
      openPanel()

      subPills().find(button => button.textContent!.includes('Dimmable'))!.click()
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
