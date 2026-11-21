import type { FilterContext, RoomInput } from '@/app/core/accessories/filters/accessory-filters'
import type { KioskScope } from '@/app/modules/kiosk/kiosk-scope'

import { buildBatteryIndex } from '@/app/core/accessories/filters/accessory-battery'
import { DEFAULT_FILTER_STATE, matchesFilter } from '@/app/core/accessories/filters/accessory-filters'
import { scopeFilterState } from '@/app/modules/kiosk/kiosk-scope'

/**
 * The uniqueIds a scope resolves to right now: every accessory on the given rooms that matches the scope's
 * rooms, categories, subcategories and labels, the way the accessories page filters. Hidden accessories are left out.
 * `labels` maps each uniqueId to its labels.
 */
export function resolveScopeUniqueIds(
  scope: KioskScope,
  rooms: RoomInput[],
  labels: ReadonlyMap<string, string[]> = new Map(),
): string[] {
  const state = {
    ...DEFAULT_FILTER_STATE,
    ...scopeFilterState(scope),
  }
  const batteryIndex = buildBatteryIndex(rooms.flatMap(room => room.services))
  const context: FilterContext = { labels }

  const uniqueIds = new Set<string>()
  for (const room of rooms) {
    for (const service of room.services) {
      if (service.uniqueId && matchesFilter(service, room.name, state, batteryIndex, context)) {
        uniqueIds.add(service.uniqueId)
      }
    }
  }
  return [...uniqueIds]
}
