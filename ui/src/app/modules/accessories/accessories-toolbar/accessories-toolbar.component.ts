import type { BatteryInfo } from '@/app/core/accessories/filters/accessory-battery'
import type { AccessoryCategory } from '@/app/core/accessories/filters/accessory-categories'
import type { AccessoryFilterState, AccessoryGroupBy, AccessorySortBy, FilterContext, RoomInput } from '@/app/core/accessories/filters/accessory-filters'
import type { AccessoryView, BuiltInView } from '@/app/core/accessories/filters/accessory-views'

import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, OnDestroy, output, signal, TemplateRef, untracked, viewChild } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NgbDropdown, NgbDropdownItem, NgbDropdownMenu, NgbDropdownToggle } from '@ng-bootstrap/ng-bootstrap/dropdown'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { NgbOffcanvas, NgbOffcanvasRef } from '@ng-bootstrap/ng-bootstrap/offcanvas'
import { NgbTooltip } from '@ng-bootstrap/ng-bootstrap/tooltip'
import { TranslatePipe } from '@ngx-translate/core'
import { debounceTime, Subject } from 'rxjs'

import { ACCESSORY_CATEGORIES, ACCESSORY_SUBCATEGORIES, getAccessorySubcategory } from '@/app/core/accessories/filters/accessory-categories'
import { DEFAULT_FILTER_STATE, isFilterActive, matchesFilter } from '@/app/core/accessories/filters/accessory-filters'
import { BUILT_IN_VIEWS } from '@/app/core/accessories/filters/accessory-views'
import { AuthService } from '@/app/core/auth/auth.service'
import { KioskLinksService } from '@/app/modules/kiosk/kiosk-links.service'
import { openAddTablet } from '@/app/modules/users/users-tablets/open-tablet-editor'

export type FacetKey = 'rooms' | 'categories' | 'bridges' | 'protocols' | 'states' | 'battery' | 'labels'

/** The order the filter panel shows its sections in */
const FACET_ORDER: FacetKey[] = [
  'rooms',
  'categories',
  'labels',
  'bridges',
  'protocols',
  'states',
  'battery',
]

/** Sections with more options than this collapse behind Show all */
const COLLAPSED_OPTION_COUNT = 8

export interface FacetOption {
  value: string
  /** The label, or a translation key when `translate` is set */
  label: string
  translate: boolean
  /** Accessories this option would show, ignoring the other filters (but not hidden ones unless shown) */
  count: number
}

export interface Facet {
  key: FacetKey
  labelKey: string
  options: FacetOption[]
  selected: FacetOption[]
}

/** A removable chip for one active filter */
/** A subcategory section shown beneath a selected category */
export interface SubcategoryGroup {
  category: AccessoryCategory
  labelKey: string
  options: FacetOption[]
}

/** Key that changes whenever the filter changes, used to tell which view is active */
function filterKey(state: AccessoryFilterState): string {
  return JSON.stringify([
    state.search.trim(),
    [...state.rooms].sort(),
    [...state.categories].sort(),
    [...state.subcategories].sort(),
    [...state.bridges].sort(),
    [...state.protocols].sort(),
    [...state.states].sort(),
    [...state.battery].sort(),
    [...state.labels].sort(),
    !!state.showHidden,
    !!state.onDashboardOnly,
    state.groupBy,
    state.sortBy,
  ])
}

/** The filter with every filter cleared (hidden included), keeping the grouping and sort the user picked */
function clearedFilter(state: AccessoryFilterState): AccessoryFilterState {
  return {
    ...DEFAULT_FILTER_STATE,
    groupBy: state.groupBy,
    sortBy: state.sortBy,
  }
}

function countMatching(
  rooms: RoomInput[],
  state: AccessoryFilterState,
  batteryIndex: Map<string, BatteryInfo>,
  context: FilterContext,
): number {
  let total = 0
  for (const room of rooms) {
    for (const service of room.services) {
      if (matchesFilter(service, room.name, state, batteryIndex, context)) {
        total++
      }
    }
  }
  return total
}

/**
 * The search, filter, grouping and sort controls for the accessories page. It holds no state of
 * its own: it shows `filter` and emits the next filter whenever the user changes something.
 * The filters sit in a slide-out panel, opened from the Filters button.
 */
@Component({
  selector: 'app-accessories-toolbar',
  imports: [
    NgbDropdown,
    NgbDropdownToggle,
    NgbDropdownMenu,
    NgbDropdownItem,
    NgbTooltip,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './accessories-toolbar.component.html',
  styleUrl: './accessories-toolbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccessoriesToolbarComponent implements OnDestroy {
  public readonly filter = model.required<AccessoryFilterState>()
  public readonly rooms = input<RoomInput[]>([])
  public readonly bridges = input<string[]>([])
  public readonly batteryIndex = input<Map<string, BatteryInfo>>(new Map())
  /** Accessories in the current result */
  public readonly shown = input(0)
  /** Accessories on the page, before filtering */
  public readonly total = input(0)
  public readonly manageLayoutActive = input(false)
  /** The saved views, the user's own and those shared with them */
  public readonly customViews = input<AccessoryView[]>([])
  /** uniqueId -> labels */
  public readonly labels = input<Record<string, string[]>>({})
  /** The signed-in user, to tell own views from shared ones */
  public readonly username = input('')
  /** The custom view applied, or null */
  public readonly activeViewId = input<string | null>(null)

  public readonly manageLayoutToggle = output<void>()
  /** A custom view was picked (its id), or the built-in views were picked (null) */
  public readonly viewSelect = output<string | null>()
  /** Save the current filter as a view with this name */
  public readonly saveView = output<string>()
  /** Open the manage views modal */
  public readonly manageViews = output<void>()

  public readonly views: readonly BuiltInView[] = BUILT_IN_VIEWS
  public readonly groupOptions: Array<{ value: AccessoryGroupBy, labelKey: string }> = [
    { value: 'room', labelKey: 'accessories.toolbar.group_room' },
    { value: 'category', labelKey: 'accessories.toolbar.group_category' },
    { value: 'bridge', labelKey: 'accessories.toolbar.group_bridge' },
    { value: 'floor', labelKey: 'accessories.toolbar.group_floor' },
    { value: 'none', labelKey: 'accessories.toolbar.group_none' },
  ]

  public readonly sortOptions: Array<{ value: AccessorySortBy, labelKey: string }> = [
    { value: 'manual', labelKey: 'accessories.toolbar.sort_manual' },
    { value: 'name', labelKey: 'accessories.toolbar.sort_name' },
    { value: 'category', labelKey: 'accessories.toolbar.sort_category' },
    { value: 'battery', labelKey: 'accessories.toolbar.sort_battery' },
  ]

  public readonly searchText = signal('')
  /** The inline form for naming a new view is open (in the Views section of the panel) */
  public readonly saveFormOpen = signal(false)
  public readonly viewName = signal('')
  /** Sections the user expanded past the first options */
  public readonly expandedFacets = signal<ReadonlySet<FacetKey>>(new Set())

  private readonly filtersPanel = viewChild.required<TemplateRef<unknown>>('filtersPanel')
  private offcanvasRef: NgbOffcanvasRef | null = null

  public readonly active = computed(() => isFilterActive(this.filter()))

  /** The labels on the accessories, as the matching context needs them */
  private readonly labelContext = computed<FilterContext>(() => ({
    labels: new Map(Object.entries(this.labels())),
  }))

  /** Every label in use, sorted */
  public readonly allLabels = computed(() => [
    ...new Set(Object.values(this.labels()).flat()),
  ].sort((a, b) => a.localeCompare(b)))

  private readonly $kiosk = inject(KioskLinksService)
  private readonly $auth = inject(AuthService)
  private readonly $modal = inject(NgbModal)
  private readonly $offcanvas = inject(NgbOffcanvas)

  /** The view the kiosk opens for: the custom view applied, or the built-in one matching the filter */
  public readonly kioskViewId = computed<string | null>(() => {
    const custom = this.activeViewId()
    if (custom !== null) {
      return custom
    }
    const builtIn = this.activeView()
    return builtIn && builtIn !== 'all'
      ? builtIn
      : null
  })

  /** The built-in view whose settings match the filter, 'all' when no filter is set, or null */
  public readonly activeView = computed<string | null>(() => {
    if (this.activeViewId() !== null) {
      return null
    }
    const current = this.filter()
    const match = BUILT_IN_VIEWS.find(view => filterKey(current) === filterKey({
      ...clearedFilter(current),
      ...view.state,
    } as AccessoryFilterState))
    if (match) {
      return match.id
    }
    return this.active()
      ? null
      : 'all'
  })

  /** How many accessories each subcategory holds, ignoring the other filters (but not hidden ones unless shown) */
  private readonly subcategoryCounts = computed(() => {
    const counts = new Map<string, number>()
    const base = { ...DEFAULT_FILTER_STATE, showHidden: this.filter().showHidden }
    const batteryIndex = this.batteryIndex()
    const context = this.labelContext()
    for (const room of this.rooms()) {
      for (const service of room.services) {
        if (matchesFilter(service, room.name, base, batteryIndex, context)) {
          const key = getAccessorySubcategory(service)
          counts.set(key, (counts.get(key) ?? 0) + 1)
        }
      }
    }
    return counts
  })

  /** For each selected category with 2 or more subcategories in the data, its subcategory options */
  public readonly subcategoryGroups = computed<SubcategoryGroup[]>(() => {
    const current = this.filter()
    const counts = this.subcategoryCounts()
    const groups: SubcategoryGroup[] = []
    for (const category of ACCESSORY_CATEGORIES) {
      if (!current.categories.includes(category)) {
        continue
      }
      const options = ACCESSORY_SUBCATEGORIES[category]
        .map(value => ({
          value,
          label: `accessories.subcategories.${value}`,
          translate: true,
          count: counts.get(value) ?? 0,
        }))
        .filter(option => option.count > 0 || current.subcategories.includes(option.value))
      if (options.length >= 2) {
        groups.push({ category, labelKey: `accessories.subcategories.group_${category}`, options })
      }
    }
    return groups
  })

  /** One entry per filter section, with the count each option would show */
  public readonly facets = computed<Facet[]>(() => {
    const current = this.filter()
    const rooms = this.rooms()
    const batteryIndex = this.batteryIndex()
    const context = this.labelContext()

    const build = (key: FacetKey, labelKey: string, base: Array<{ value: string, label: string, translate: boolean }>): Facet => {
      const selectedValues = current[key] as string[]
      const options = base
        .map(option => ({
          ...option,
          count: countMatching(rooms, {
            ...DEFAULT_FILTER_STATE,
            showHidden: current.showHidden,
            [key]: [option.value],
          } as AccessoryFilterState, batteryIndex, context),
        }))
        .filter(option => option.count > 0 || selectedValues.includes(option.value))
      return {
        key,
        labelKey,
        options,
        selected: options.filter(option => selectedValues.includes(option.value)),
      }
    }

    return [
      build('rooms', 'accessories.toolbar.facet_room', rooms.map(room => ({ value: room.name, label: room.name, translate: false }))),
      build('categories', 'accessories.toolbar.facet_category', ACCESSORY_CATEGORIES.map(category => ({
        value: category,
        label: `accessories.categories.${category}`,
        translate: true,
      }))),
      build('bridges', 'accessories.toolbar.facet_bridge', this.bridges().map(bridge => ({ value: bridge, label: bridge, translate: false }))),
      build('protocols', 'accessories.toolbar.facet_protocol', [
        { value: 'hap', label: 'accessories.toolbar.protocol_hap', translate: true },
        { value: 'matter', label: 'accessories.toolbar.protocol_matter', translate: true },
      ]),
      build('states', 'accessories.toolbar.facet_state', [
        { value: 'on', label: 'accessories.toolbar.state_on', translate: true },
        { value: 'notResponding', label: 'accessories.toolbar.state_not_responding', translate: true },
      ]),
      build('battery', 'accessories.toolbar.facet_battery', [
        { value: 'any', label: 'accessories.toolbar.battery_any', translate: true },
        { value: 'low', label: 'accessories.toolbar.battery_low', translate: true },
        { value: 'under20', label: 'accessories.toolbar.battery_under_20', translate: true },
        { value: 'charging', label: 'accessories.toolbar.battery_charging', translate: true },
      ]),
      build('labels', 'accessories.toolbar.facet_label', this.allLabels().map(label => ({ value: label, label, translate: false }))),
    ]
  })

  /** The filter sections, in the order the panel shows them */
  public readonly orderedFacets = computed<Facet[]>(() => {
    const byKey = new Map(this.facets().map(facet => [facet.key, facet]))
    return FACET_ORDER
      .map(key => byKey.get(key))
      .filter((facet): facet is Facet => !!facet)
  })

  /** How many filters the panel holds on, for the badge on its button */
  public readonly filterCount = computed(() =>
    this.facets().reduce((total, facet) => total + facet.selected.length, 0)
    + this.filter().subcategories.length
    + (this.filter().showHidden
      ? 1
      : 0),
  )

  private searchPending = false
  private search$ = new Subject<string>()

  constructor() {
    this.search$
      .pipe(debounceTime(150), takeUntilDestroyed())
      .subscribe((text) => {
        this.searchPending = false
        this.emit({ search: text })
      })

    // Keep the search box in step when the filter changes from elsewhere (a view, Clear, or the page)
    effect(() => {
      const search = this.filter().search
      untracked(() => {
        if (!this.searchPending && search !== this.searchText()) {
          this.searchText.set(search)
        }
      })
    })
  }

  public ngOnDestroy(): void {
    this.closeFilters()
  }

  public onSearch(text: string): void {
    this.searchText.set(text)
    this.searchPending = true
    this.search$.next(text)
  }

  public onGroupBy(event: Event): void {
    this.emit({ groupBy: (event.target as HTMLInputElement).value as AccessoryGroupBy })
  }

  public onSortBy(event: Event): void {
    this.emit({ sortBy: (event.target as HTMLInputElement).value as AccessorySortBy })
  }

  public onShowHidden(event: Event): void {
    this.emit({ showHidden: (event.target as HTMLInputElement).checked })
  }

  /** Open the filter panel from the right */
  public openFilters(): void {
    this.closeFilters()
    this.offcanvasRef = this.$offcanvas.open(this.filtersPanel(), {
      position: 'end',
      panelClass: 'accessories-filters-panel',
      ariaLabelledBy: 'accessories-filters-title',
    })
    // Dismissing with Escape or the backdrop rejects the result promise; nothing waits on it
    this.offcanvasRef.result.catch(() => undefined)
  }

  public closeFilters(): void {
    this.offcanvasRef?.close()
    this.offcanvasRef = null
  }

  /** Add or remove one value from a multi-select filter. Any selected value matches within a filter. */
  public toggleValue(key: FacetKey, value: string): void {
    const current = this.filter()
    const selected = current[key] as string[]
    const next = selected.includes(value)
      ? selected.filter(entry => entry !== value)
      : [...selected, value]
    if (key === 'categories' && selected.includes(value)) {
      // Deselecting a category drops its subcategories too
      const own = ACCESSORY_SUBCATEGORIES[value as AccessoryCategory] ?? []
      this.emit({
        categories: next as AccessoryCategory[],
        subcategories: current.subcategories.filter(entry => !own.includes(entry)),
      })
      return
    }
    this.emit({ [key]: next } as Partial<AccessoryFilterState>)
  }

  /** Add or remove one subcategory, which narrows within its category */
  public toggleSubcategory(value: string): void {
    const current = this.filter().subcategories
    this.emit({
      subcategories: current.includes(value)
        ? current.filter(entry => entry !== value)
        : [...current, value],
    })
  }

  /** The subcategory section that sits beneath a category pill, when that category is selected and has one */
  public subcategoryGroupFor(facet: Facet, option: FacetOption): SubcategoryGroup | undefined {
    if (facet.key !== 'categories') {
      return undefined
    }
    return this.subcategoryGroups().find(group => group.category === option.value)
  }

  public isSubcategorySelected(value: string): boolean {
    return this.filter().subcategories.includes(value)
  }

  public isSelected(facet: Facet, option: FacetOption): boolean {
    return facet.selected.some(entry => entry.value === option.value)
  }

  /** The options a section shows: the first few, every selected one, or all once expanded */
  public visibleOptions(facet: Facet): FacetOption[] {
    if (this.expandedFacets().has(facet.key) || facet.options.length <= COLLAPSED_OPTION_COUNT) {
      return facet.options
    }
    return facet.options.filter((option, index) => index < COLLAPSED_OPTION_COUNT || this.isSelected(facet, option))
  }

  public toggleExpanded(key: FacetKey): void {
    const next = new Set(this.expandedFacets())
    if (next.has(key)) {
      next.delete(key)
    } else {
      next.add(key)
    }
    this.expandedFacets.set(next)
  }

  /** Open a view as a kiosk, in this tab */
  public openKiosk(viewId: string): void {
    void this.$kiosk.open(viewId)
  }

  /** Copy the kiosk link for a view */
  public copyKioskLink(viewId: string): void {
    void this.$kiosk.copy(viewId)
  }

  /** Only admins pair tablets */
  public canPairTablets(): boolean {
    return !!this.$auth.user.admin
  }

  /** Add a tablet to this view, then show its pairing code */
  public pairTablet(viewId: string): void {
    void openAddTablet(this.$modal, viewId)
  }

  /** Apply a built-in view on top of a cleared filter, or clear everything for 'All' */
  public applyView(view: BuiltInView | null): void {
    this.applyState(view?.state ?? null)
    this.viewSelect.emit(null)
  }

  /** Apply a saved view on top of a cleared filter. Its pinned and excluded accessories follow via the page. */
  public applyCustomView(view: AccessoryView): void {
    this.applyState(view.state)
    this.viewSelect.emit(view.id)
  }

  /** Whether a view was shared with the user by someone else */
  public isSharedWithMe(view: AccessoryView): boolean {
    return !!view.owner && view.owner !== this.username()
  }

  public openSaveView(): void {
    this.viewName.set('')
    this.saveFormOpen.set(true)
  }

  public onViewNameInput(event: Event): void {
    this.viewName.set((event.target as HTMLInputElement).value)
  }

  public confirmSaveView(): void {
    const name = this.viewName().trim()
    if (!name) {
      return
    }
    this.saveView.emit(name)
    this.saveFormOpen.set(false)
    this.viewName.set('')
  }

  public cancelSaveView(): void {
    this.saveFormOpen.set(false)
    this.viewName.set('')
  }

  private applyState(state: Partial<AccessoryFilterState> | null): void {
    const next = clearedFilter(this.filter())
    this.searchPending = false
    this.searchText.set('')
    this.filter.set(state
      ? {
          ...next,
          ...state,
        } as AccessoryFilterState
      : next)
  }

  public clear(): void {
    this.applyView(null)
  }

  private emit(patch: Partial<AccessoryFilterState>): void {
    this.filter.set({
      ...this.filter(),
      ...patch,
    })
  }
}
