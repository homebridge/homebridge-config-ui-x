import type { AccessoryFilterState } from '@/app/core/accessories/filters/accessory-filters'
import type { ComponentFixture } from '@angular/core/testing'

import { TestBed } from '@angular/core/testing'
import { TranslateService } from '@ngx-translate/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildBatteryIndex } from '@/app/core/accessories/filters/accessory-battery'
import { DEFAULT_FILTER_STATE } from '@/app/core/accessories/filters/accessory-filters'
import { BUILT_IN_VIEWS } from '@/app/core/accessories/filters/accessory-views'
import { provideTestTranslate } from '@/testing/providers'

import { AccessoriesToolbarComponent } from './accessories-toolbar.component'

/**
 * The filter, grouping and sort controls on the accessories page.
 *
 * The toolbar holds no state: each test sets the filter as an input and checks
 * what it emits.
 */
describe('accessoriesToolbarComponent', () => {
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

  function chips(): HTMLButtonElement[] {
    return [
      ...fixture.nativeElement.querySelectorAll('.accessories-chip'),
    ]
  }

  function viewButton(label: string): HTMLButtonElement {
    return [
      ...fixture.nativeElement.querySelectorAll('.btn-group button'),
    ]
      .find((button: any) => button.textContent.trim() === label) as HTMLButtonElement
  }

  function findButton(text: string): HTMLButtonElement | undefined {
    return [
      ...fixture.nativeElement.querySelectorAll('button'),
    ].find((button: any) => button.textContent.trim() === text) as HTMLButtonElement | undefined
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AccessoriesToolbarComponent],
      providers: [
        provideTestTranslate(),
      ],
    })

    // The page's own strings, so the assertions read like the screen
    TestBed.inject(TranslateService).setTranslation('en', {
      'accessories.toolbar.showing': 'Showing {{shown}} of {{total}}',
      'accessories.toolbar.filters': 'Filters',
      'accessories.toolbar.clear': 'Clear',
      'accessories.categories.lights': 'Lights',
      'accessories.views.lights': 'Lights',
      'accessories.views.all': 'All',
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

      // Hidden accessories are not counted until the user asks for them
      expect(fixture.nativeElement.textContent).toContain('Lights (2)')
      expect(fixture.nativeElement.textContent).toContain('Kitchen (3)')
      expect(fixture.nativeElement.textContent).not.toContain('Office (')
    })

    it('shows the selected value and its count on the chip', () => {
      setup({
        categories: ['lights'],
      })

      const chip = chips().find(entry => entry.textContent!.includes('Lights'))
      expect(chip?.textContent).toContain('(2)')
    })

    it('shows how many accessories are on screen out of the total', () => {
      setup({}, { shown: 2, total: 3 })

      const status = fixture.nativeElement.querySelector('[role="status"]') as HTMLElement
      expect(status.textContent!.replace(/\s+/g, ' ').trim()).toBe('Showing 2 of 3')
    })
  })

  describe('clearing', () => {
    it('shows Clear only when a filter is set', () => {
      setup()
      expect(fixture.nativeElement.querySelector('button.btn-link')).toBeNull()

      setup({ search: 'kettle' })
      expect(fixture.nativeElement.querySelector('button.btn-link')).not.toBeNull()
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
    it('lists All and every built-in view', () => {
      setup()

      const labels = [
        ...fixture.nativeElement.querySelectorAll('.btn-group button'),
      ]
        .map((button: any) => button.textContent.trim())
      expect(labels[0]).toBe('All')
      expect(labels.length).toBe(BUILT_IN_VIEWS.length + 1)
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
        ...fixture.nativeElement.querySelectorAll('.accessories-custom-view'),
      ].find((button: any) => button.textContent.includes(label)) as HTMLButtonElement | undefined
    }

    it('lists the custom views after the built-in ones', () => {
      setup()
      fixture.componentRef.setInput('customViews', [ownView, aliceView])
      fixture.detectChanges()

      const labels = [
        ...fixture.nativeElement.querySelectorAll('.btn-group button'),
      ].map((button: any) => button.textContent.replace(/\s+/g, ' ').trim())
      expect(labels.slice(-2)).toEqual(['Downstairs', 'Alice lights Shared by alice'])
    })

    it('names the owner of a view shared with the user', () => {
      setup()
      fixture.componentRef.setInput('username', 'bob')
      fixture.componentRef.setInput('customViews', [ownView, aliceView])
      fixture.detectChanges()

      expect(pill('Alice lights')!.textContent).toContain('Shared by alice')
      expect(pill('Alice lights')!.querySelector('.fa-share-nodes')).not.toBeNull()
      expect(pill('Downstairs')!.textContent).not.toContain('Shared by')
    })

    it('marks the active custom view, and no built-in view', () => {
      setup()
      fixture.componentRef.setInput('customViews', [ownView])
      fixture.componentRef.setInput('activeViewId', 'v1')
      fixture.detectChanges()

      expect(pill('Downstairs')!.classList).toContain('active')
      expect(viewButton('All')!.classList).not.toContain('active')
    })

    it('applies a custom view on top of a cleared filter, and reports which view', () => {
      const toolbar = setup({
        search: 'x',
        rooms: ['Office'],
      })
      fixture.componentRef.setInput('customViews', [ownView])
      fixture.detectChanges()
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

    it('offers Save as view only when a filter is active', () => {
      setup()
      expect(findButton('Save as view')).toBeUndefined()

      setup({ search: 'kettle' })
      expect(findButton('Save as view')).toBeDefined()
    })

    it('names and saves a view from the inline form, and closes the form', () => {
      const toolbar = setup({ search: 'kettle' })
      const saved = vi.fn()
      toolbar.saveView.subscribe(saved)

      toolbar.openSaveView()
      fixture.detectChanges()
      expect(fixture.nativeElement.querySelector('.accessories-view-name')).not.toBeNull()

      toolbar.onViewNameInput({
        target: { value: '  Kettles ' },
      } as unknown as Event)
      toolbar.confirmSaveView()
      fixture.detectChanges()

      expect(saved).toHaveBeenCalledWith('Kettles')
      expect(fixture.nativeElement.querySelector('.accessories-view-name')).toBeNull()
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

    it('opens the manage views modal from its button', () => {
      const toolbar = setup()
      const opened = vi.fn()
      toolbar.manageViews.subscribe(opened)

      findButton('Manage views')!.click()

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
        ...fixture.nativeElement.querySelectorAll('#accessories-group-by option'),
      ].map((option: any) => option.value)
      expect(values).toContain('floor')
    })
  })

  describe('small screens', () => {
    function resizeTo(width: number) {
      vi.stubGlobal('innerWidth', width)
      window.dispatchEvent(new Event('resize'))
      fixture.detectChanges()
    }

    it('collapses the chips behind a Filters button under 576 px', () => {
      setup()
      resizeTo(400)

      const toggle = fixture.nativeElement.querySelector('[aria-controls="accessories-toolbar-chips"]') as HTMLButtonElement
      const panel = fixture.nativeElement.querySelector('#accessories-toolbar-chips') as HTMLElement
      expect(toggle).not.toBeNull()
      expect(panel.classList.contains('d-none')).toBe(true)
    })

    it('opens and closes the chips with the Filters button', () => {
      setup()
      resizeTo(400)

      const toggle = fixture.nativeElement.querySelector('[aria-controls="accessories-toolbar-chips"]') as HTMLButtonElement
      const panel = fixture.nativeElement.querySelector('#accessories-toolbar-chips') as HTMLElement

      toggle.click()
      fixture.detectChanges()
      expect(panel.classList.contains('d-none')).toBe(false)
      expect(toggle.getAttribute('aria-expanded')).toBe('true')

      toggle.click()
      fixture.detectChanges()
      expect(panel.classList.contains('d-none')).toBe(true)
    })

    it('shows the chips straight away on wide screens, with no Filters button', () => {
      setup()
      resizeTo(1200)

      expect(fixture.nativeElement.querySelector('[aria-controls="accessories-toolbar-chips"]')).toBeNull()
      expect((fixture.nativeElement.querySelector('#accessories-toolbar-chips') as HTMLElement).classList.contains('d-none')).toBe(false)
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
})
