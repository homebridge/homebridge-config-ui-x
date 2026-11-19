import type { AccessoryFilterState } from './accessory-filters'

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
