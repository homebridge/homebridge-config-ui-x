import type { FilterContext, RoomInput } from '@/app/core/accessories/filters/accessory-filters'
import type { AccessoryView } from '@/app/core/accessories/filters/accessory-views'

import { buildBatteryIndex } from '@/app/core/accessories/filters/accessory-battery'
import { DEFAULT_FILTER_STATE, groupAndSort } from '@/app/core/accessories/filters/accessory-filters'
import { BUILT_IN_VIEWS } from '@/app/core/accessories/filters/accessory-views'

/** The view a kiosk id names: a built-in view, or one of the user's (or one shared with them) */
export function findKioskView(viewId: string, views: AccessoryView[]): AccessoryView | undefined {
  const builtIn = BUILT_IN_VIEWS.find(entry => entry.id === viewId)
  if (builtIn) {
    return { id: builtIn.id, name: builtIn.labelKey, state: builtIn.state }
  }
  return views.find(entry => entry.id === viewId)
}

/**
 * The uniqueIds a view resolves to right now, filtered, grouped and sorted the way the accessories page shows it.
 * The view's own pinned and excluded lists are applied; `ctx` supplies labels and floors.
 */
export function resolveViewUniqueIds(view: AccessoryView, rooms: RoomInput[], ctx: FilterContext = {}): string[] {
  const state = {
    ...DEFAULT_FILTER_STATE,
    ...view.state,
  }
  const groups = groupAndSort(rooms, state, buildBatteryIndex(rooms.flatMap(room => room.services)), {
    ...ctx,
    pinned: new Set(view.pinned ?? []),
    excluded: new Set(view.excluded ?? []),
  })

  const uniqueIds = new Set<string>()
  for (const group of groups) {
    for (const service of group.services) {
      if (service.uniqueId) {
        uniqueIds.add(service.uniqueId)
      }
    }
  }
  return [...uniqueIds]
}
