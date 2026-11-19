import type { AccessoryFilterState } from './accessory-filters'

/** A view the user saved: a filter, grouping and sort, plus pinned and excluded accessories */
export interface AccessoryView {
  id: string
  name: string
  state: Partial<AccessoryFilterState>
  /** uniqueIds that always show, whatever the filter */
  pinned?: string[]
  /** uniqueIds that never show */
  excluded?: string[]
  /** Whether others can see this view. Only the owner can change it. */
  shared?: boolean
  /** Set by the server on views shared with this user. Missing on the user's own views. */
  owner?: string
}

/** A named floor and the rooms on it. A room is on at most one floor. */
export interface AccessoryFloor {
  name: string
  rooms: string[]
}

export type BuiltInViewId = 'favorites' | 'lights' | 'climate' | 'security' | 'batteries'

export interface BuiltInView {
  id: BuiltInViewId
  /** Translation key for the view's name */
  labelKey: string
  /** Filter and sort settings applied on top of DEFAULT_FILTER_STATE */
  state: Partial<AccessoryFilterState>
}

export const BUILT_IN_VIEWS: readonly BuiltInView[] = [
  {
    id: 'favorites',
    labelKey: 'accessories.views.favorites',
    state: { onDashboardOnly: true },
  },
  {
    id: 'lights',
    labelKey: 'accessories.views.lights',
    state: {
      categories: ['lights'],
    },
  },
  {
    id: 'climate',
    labelKey: 'accessories.views.climate',
    state: {
      categories: ['climate'],
    },
  },
  {
    id: 'security',
    labelKey: 'accessories.views.security',
    state: {
      categories: ['security'],
    },
  },
  {
    id: 'batteries',
    labelKey: 'accessories.views.batteries',
    state: {
      battery: ['any'],
      sortBy: 'battery',
    },
  },
]
