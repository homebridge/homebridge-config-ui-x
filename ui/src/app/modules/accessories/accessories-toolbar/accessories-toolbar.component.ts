import type { BatteryInfo } from '@/app/core/accessories/filters/accessory-battery'
import type { AccessoryFilterState, AccessoryGroupBy, AccessorySortBy, RoomInput } from '@/app/core/accessories/filters/accessory-filters'
import type { BuiltInView } from '@/app/core/accessories/filters/accessory-views'

import { ChangeDetectionStrategy, Component, computed, effect, input, model, output, signal, untracked } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NgbDropdown, NgbDropdownItem, NgbDropdownMenu, NgbDropdownToggle } from '@ng-bootstrap/ng-bootstrap/dropdown'
import { TranslatePipe } from '@ngx-translate/core'
import { debounceTime, Subject } from 'rxjs'

import { ACCESSORY_CATEGORIES } from '@/app/core/accessories/filters/accessory-categories'
import { DEFAULT_FILTER_STATE, isFilterActive, matchesFilter } from '@/app/core/accessories/filters/accessory-filters'
import { BUILT_IN_VIEWS } from '@/app/core/accessories/filters/accessory-views'

/** Width below which the filter chips collapse behind a Filters button */
const NARROW_WIDTH = 576

export type FacetKey = 'rooms' | 'categories' | 'bridges' | 'protocols' | 'states' | 'battery'

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

/** Key that changes whenever the filter changes, used to tell which view is active */
function filterKey(state: AccessoryFilterState): string {
  return JSON.stringify([
    state.search.trim(),
    [...state.rooms].sort(),
    [...state.categories].sort(),
    [...state.bridges].sort(),
    [...state.protocols].sort(),
    [...state.states].sort(),
    [...state.battery].sort(),
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

function countMatching(rooms: RoomInput[], state: AccessoryFilterState, batteryIndex: Map<string, BatteryInfo>): number {
  let total = 0
  for (const room of rooms) {
    for (const service of room.services) {
      if (matchesFilter(service, room.name, state, batteryIndex)) {
        total++
      }
    }
  }
  return total
}

/**
 * The filter, grouping and sort controls for the accessories page. It holds no state of
 * its own: it shows `filter` and emits the next filter whenever the user changes something.
 */
@Component({
  selector: 'app-accessories-toolbar',
  imports: [
    NgbDropdown,
    NgbDropdownToggle,
    NgbDropdownMenu,
    NgbDropdownItem,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './accessories-toolbar.component.html',
  styleUrl: './accessories-toolbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:resize)': 'onResize()',
  },
})
export class AccessoriesToolbarComponent {
  public readonly filter = model.required<AccessoryFilterState>()
  public readonly rooms = input<RoomInput[]>([])
  public readonly bridges = input<string[]>([])
  public readonly batteryIndex = input<Map<string, BatteryInfo>>(new Map())
  /** Accessories in the current result */
  public readonly shown = input(0)
  /** Accessories on the page, before filtering */
  public readonly total = input(0)
  public readonly manageLayoutActive = input(false)
  public readonly selectActive = input(false)

  public readonly manageLayoutToggle = output<void>()
  public readonly selectToggle = output<void>()

  public readonly views: readonly BuiltInView[] = BUILT_IN_VIEWS
  public readonly groupOptions: Array<{ value: AccessoryGroupBy, labelKey: string }> = [
    { value: 'room', labelKey: 'accessories.toolbar.group_room' },
    { value: 'category', labelKey: 'accessories.toolbar.group_category' },
    { value: 'bridge', labelKey: 'accessories.toolbar.group_bridge' },
    { value: 'none', labelKey: 'accessories.toolbar.group_none' },
  ]

  public readonly sortOptions: Array<{ value: AccessorySortBy, labelKey: string }> = [
    { value: 'manual', labelKey: 'accessories.toolbar.sort_manual' },
    { value: 'name', labelKey: 'accessories.toolbar.sort_name' },
    { value: 'category', labelKey: 'accessories.toolbar.sort_category' },
    { value: 'battery', labelKey: 'accessories.toolbar.sort_battery' },
  ]

  public readonly searchText = signal('')
  public readonly narrow = signal(typeof window !== 'undefined' && window.innerWidth < NARROW_WIDTH)
  public readonly chipsOpen = signal(false)

  public readonly active = computed(() => isFilterActive(this.filter()))

  /** The built-in view whose settings match the filter, 'all' when no filter is set, or null */
  public readonly activeView = computed<string | null>(() => {
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

  /** One entry per filter chip, with the count each option would show */
  public readonly facets = computed<Facet[]>(() => {
    const current = this.filter()
    const rooms = this.rooms()
    const batteryIndex = this.batteryIndex()

    const build = (key: FacetKey, labelKey: string, base: Array<{ value: string, label: string, translate: boolean }>): Facet => {
      const selectedValues = current[key] as string[]
      const options = base
        .map(option => ({
          ...option,
          count: countMatching(rooms, {
            ...DEFAULT_FILTER_STATE,
            showHidden: current.showHidden,
            [key]: [option.value],
          } as AccessoryFilterState, batteryIndex),
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
    ]
  })

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

  public onResize(): void {
    this.narrow.set(window.innerWidth < NARROW_WIDTH)
  }

  public onSearch(text: string): void {
    this.searchText.set(text)
    this.searchPending = true
    this.search$.next(text)
  }

  public onGroupBy(event: Event): void {
    this.emit({ groupBy: (event.target as HTMLSelectElement).value as AccessoryGroupBy })
  }

  public onSortBy(event: Event): void {
    this.emit({ sortBy: (event.target as HTMLSelectElement).value as AccessorySortBy })
  }

  public onShowHidden(event: Event): void {
    this.emit({ showHidden: (event.target as HTMLInputElement).checked })
  }

  /** Add or remove one value from a multi-select filter. Any selected value matches within a filter. */
  public toggleValue(key: FacetKey, value: string): void {
    const current = this.filter()
    const selected = current[key] as string[]
    const next = selected.includes(value)
      ? selected.filter(entry => entry !== value)
      : [...selected, value]
    this.emit({ [key]: next } as Partial<AccessoryFilterState>)
  }

  public isSelected(facet: Facet, option: FacetOption): boolean {
    return facet.selected.some(entry => entry.value === option.value)
  }

  /** Apply a built-in view on top of a cleared filter, or clear everything for 'All' */
  public applyView(view: BuiltInView | null): void {
    const next = clearedFilter(this.filter())
    this.searchPending = false
    this.searchText.set('')
    this.filter.set(view
      ? {
          ...next,
          ...view.state,
        } as AccessoryFilterState
      : next)
  }

  public clear(): void {
    this.applyView(null)
  }

  public toggleChips(): void {
    this.chipsOpen.set(!this.chipsOpen())
  }

  private emit(patch: Partial<AccessoryFilterState>): void {
    this.filter.set({
      ...this.filter(),
      ...patch,
    })
  }
}
