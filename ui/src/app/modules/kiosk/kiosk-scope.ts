import type { AccessoryFilterState } from '@/app/core/accessories/filters/accessory-filters'

/** What a kiosk or paired tablet shows: rooms, categories, subcategories and labels picked directly. Empty means everything. */
export interface KioskScope {
  rooms: string[]
  categories: string[]
  subcategories: string[]
  labels: string[]
}

/** Query params as the router gives them: a repeated param is an array */
export type KioskQueryParams = Record<string, string | string[] | null | undefined>

/** The query param each list is written under. Values are repeated params, so commas, & and # in names are safe. */
export const KIOSK_SCOPE_PARAMS: Record<keyof KioskScope, string> = {
  rooms: 'room',
  categories: 'category',
  subcategories: 'subcategory',
  labels: 'label',
}

const SCOPE_LISTS = Object.keys(KIOSK_SCOPE_PARAMS) as Array<keyof KioskScope>

export const EMPTY_KIOSK_SCOPE: KioskScope = {
  rooms: [],
  categories: [],
  subcategories: [],
  labels: [],
}

function cleanList(values: readonly unknown[] | undefined): string[] {
  return [
    ...new Set((values ?? [])
      .map(value => String(value).trim())
      .filter(value => value !== '')),
  ]
}

/** A scope from the filter on the accessories page */
export function scopeFromFilter(state: Pick<AccessoryFilterState, 'rooms' | 'categories' | 'subcategories' | 'labels'>): KioskScope {
  return {
    rooms: cleanList(state.rooms),
    categories: cleanList(state.categories),
    subcategories: cleanList(state.subcategories),
    labels: cleanList(state.labels),
  }
}

/** A scope from a kiosk link's repeated query params, e.g. ?room=Kitchen&room=Hall&label=Night */
export function scopeFromQuery(params: KioskQueryParams): KioskScope {
  const scope: KioskScope = { ...EMPTY_KIOSK_SCOPE }
  for (const list of SCOPE_LISTS) {
    const raw = params[KIOSK_SCOPE_PARAMS[list]]
    const values = Array.isArray(raw)
      ? raw
      : [raw ?? '']
    scope[list] = cleanList(values)
  }
  return scope
}

/** The scope as router query params (arrays for repeated params), lists with no values left out */
export function scopeToQuery(scope: KioskScope): Record<string, string[]> {
  const query: Record<string, string[]> = {}
  for (const list of SCOPE_LISTS) {
    if (scope[list].length) {
      query[KIOSK_SCOPE_PARAMS[list]] = [...scope[list]]
    }
  }
  return query
}

/** The scope as a URLSearchParams, every value appended under its own param, for copied links */
export function scopeToSearchParams(scope: KioskScope): URLSearchParams {
  const params = new URLSearchParams()
  for (const list of SCOPE_LISTS) {
    for (const value of scope[list]) {
      params.append(KIOSK_SCOPE_PARAMS[list], value)
    }
  }
  return params
}

/**
 * The canonical form of a scope, used as the key for per-tablet settings. Each list is sorted, so the same scope
 * always gives the same key whatever order its values were picked in.
 */
export function scopeKey(scope: KioskScope): string {
  const sorted: KioskScope = {
    rooms: [...scope.rooms].sort((a, b) => a.localeCompare(b)),
    categories: [...scope.categories].sort((a, b) => a.localeCompare(b)),
    subcategories: [...scope.subcategories].sort((a, b) => a.localeCompare(b)),
    labels: [...scope.labels].sort((a, b) => a.localeCompare(b)),
  }
  return scopeToSearchParams(sorted).toString()
}

/** Whether a scope picks nothing, so it shows every accessory */
export function isEmptyScope(scope: KioskScope): boolean {
  return SCOPE_LISTS.every(list => scope[list].length === 0)
}

/** The scope as filter state, for matching the accessories it holds */
export function scopeFilterState(scope: KioskScope): Partial<AccessoryFilterState> {
  return {
    rooms: scope.rooms,
    categories: scope.categories as AccessoryFilterState['categories'],
    subcategories: scope.subcategories,
    labels: scope.labels,
    showHidden: false,
  }
}

/**
 * A readable name for a scope, for the kiosk title and tablet lists: "Kitchen · Living Room · Lights".
 * Empty scopes read "All accessories". `translate` turns a translation key into its text.
 */
export function describeScope(scope: KioskScope, translate: (key: string) => string): string {
  if (isEmptyScope(scope)) {
    return translate('kiosk.scope_all')
  }
  const parts = [
    ...scope.rooms,
    ...scope.categories.map(category => translate(`accessories.categories.${category}`)),
    ...scope.subcategories.map(subcategory => translate(`accessories.subcategories.${subcategory}`)),
    ...scope.labels,
  ]
  return parts.join(' · ')
}

/** The in-app path of the kiosk page for a scope, e.g. /kiosk?room=Kitchen, for copied links */
export function kioskPath(scope: KioskScope): string {
  const query = scopeToSearchParams(scope).toString()
  return query
    ? `/kiosk?${query}`
    : '/kiosk'
}
