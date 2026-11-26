import type { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

import type { BatteryInfo } from './accessory-battery'
import type { AccessoryCategory } from './accessory-categories'

import { ACCESSORY_CATEGORIES, getAccessoryCategory, getAccessorySubcategory } from './accessory-categories'
import { isMatterService, isServiceNotResponding, isServiceOn, serviceBridgeKey, serviceBridgeName, serviceDisplayName } from './service-helpers'

/** A named floor and the rooms on it. A room is on at most one floor. */
export interface AccessoryFloor {
  name: string
  rooms: string[]
}

/** The labels and floors kept for the accessories page, as the server holds them */
export interface AccessoryMetadata {
  /** uniqueId -> labels */
  labels: Record<string, string[]>
  floors: AccessoryFloor[]
}

export type AccessoryProtocol = 'hap' | 'matter'
export type AccessoryStateFilter = 'on' | 'notResponding' | 'lowBattery'
export type AccessoryGroupBy = 'room' | 'category' | 'bridge' | 'floor' | 'none'
export type AccessorySortBy = 'manual' | 'name' | 'category'

export interface AccessoryFilterState {
  search: string
  rooms: string[]
  categories: AccessoryCategory[]
  /** Subcategory keys (see getAccessorySubcategory). Within the selected categories, a service must match one. */
  subcategories: string[]
  bridges: string[]
  protocols: AccessoryProtocol[]
  states: AccessoryStateFilter[]
  /** Label names. A service matches when it has any of them. */
  labels: string[]
  showHidden: boolean
  onDashboardOnly?: boolean
  groupBy: AccessoryGroupBy
  sortBy: AccessorySortBy
}

export interface AccessoryGroup {
  key: string
  /** Room name, bridge name, or a category translation key */
  label: string
  services: ServiceTypeX[]
}

export interface RoomInput {
  name: string
  services: ServiceTypeX[]
}

/** Data besides the filter itself that matching and grouping need */
export interface FilterContext {
  /** uniqueId -> labels */
  labels?: ReadonlyMap<string, string[]>
  /** Floors, for groupBy 'floor' */
  floors?: AccessoryFloor[]
}

/** Group key and translation key of the group for rooms that are on no floor */
export const FLOOR_OTHER_KEY = '__other__'
export const FLOOR_OTHER_LABEL_KEY = 'accessories.floors.other'

export const DEFAULT_FILTER_STATE: AccessoryFilterState = {
  search: '',
  rooms: [],
  categories: [],
  subcategories: [],
  bridges: [],
  protocols: [],
  states: [],
  labels: [],
  showHidden: false,
  onDashboardOnly: false,
  groupBy: 'room',
  sortBy: 'manual',
}

/**
 * True when any filter differs from the default. Grouping and sorting do not
 * count, since they do not hide anything.
 */
export function isFilterActive(state: AccessoryFilterState): boolean {
  return state.search.trim() !== ''
    || state.rooms.length > 0
    || state.categories.length > 0
    || state.subcategories.length > 0
    || state.bridges.length > 0
    || state.protocols.length > 0
    || state.states.length > 0
    || state.labels.length > 0
    || state.showHidden !== DEFAULT_FILTER_STATE.showHidden
    || (state.onDashboardOnly ?? false) !== (DEFAULT_FILTER_STATE.onDashboardOnly ?? false)
}

function matchesSearch(service: ServiceTypeX, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return true
  }
  const info = (service.accessoryInformation ?? {}) as Record<string, unknown>
  const haystack = [
    service.customName,
    service.serviceName,
    info.Manufacturer,
    info.Model,
  ]
  return haystack.some(value => typeof value === 'string' && value.toLowerCase().includes(needle))
}

/** A low battery: the device reports low, or its level is under 20 percent */
function isLowBattery(info: BatteryInfo | undefined): boolean {
  return info !== undefined && (info.low || (info.level !== undefined && info.level < 20))
}

/**
 * Whether a service passes every active filter. Within one filter, any selected
 * value matches. Across filters, all must match. Empty arrays do not restrict.
 */
export function matchesFilter(
  service: ServiceTypeX,
  roomName: string,
  state: AccessoryFilterState,
  batteryIndex: Map<string, BatteryInfo>,
  context: FilterContext = {},
): boolean {
  const uniqueId = service.uniqueId ?? ''
  if (!state.showHidden && service.hidden) {
    return false
  }
  if (state.onDashboardOnly && !service.onDashboard) {
    return false
  }
  if (!matchesSearch(service, state.search)) {
    return false
  }
  if (state.rooms.length && !state.rooms.includes(roomName)) {
    return false
  }
  if (state.bridges.length && !state.bridges.some(bridge => bridge === serviceBridgeName(service) || bridge === serviceBridgeKey(service))) {
    return false
  }
  if (state.protocols.length && !state.protocols.includes(isMatterService(service)
    ? 'matter'
    : 'hap')) {
    return false
  }
  if (state.categories.length && !state.categories.includes(getAccessoryCategory(service))) {
    return false
  }
  if (state.subcategories.length && !state.subcategories.includes(getAccessorySubcategory(service))) {
    return false
  }
  if (state.states.length) {
    const stateMatch = state.states.some((filter) => {
      if (filter === 'on') {
        return isServiceOn(service)
      }
      if (filter === 'lowBattery') {
        return isLowBattery(batteryIndex.get(uniqueId))
      }
      return isServiceNotResponding(service)
    })
    if (!stateMatch) {
      return false
    }
  }
  if (state.labels.length) {
    const own = context.labels?.get(uniqueId) ?? []
    if (!state.labels.some(label => own.includes(label))) {
      return false
    }
  }
  return true
}

function compareName(a: ServiceTypeX, b: ServiceTypeX): number {
  return serviceDisplayName(a).localeCompare(serviceDisplayName(b), undefined, { numeric: true, sensitivity: 'base' })
}

function sortServices(services: ServiceTypeX[], sortBy: AccessorySortBy): ServiceTypeX[] {
  const copy = [...services]
  switch (sortBy) {
    case 'name':
      return copy.sort(compareName)
    case 'category':
      return copy.sort((a, b) =>
        ACCESSORY_CATEGORIES.indexOf(getAccessoryCategory(a)) - ACCESSORY_CATEGORIES.indexOf(getAccessoryCategory(b))
        || compareName(a, b))
    default:
      return copy
  }
}

/**
 * Filters, groups and sorts the accessories of every room.
 *
 * - groupBy 'room' keeps room order. Rooms with nothing left are dropped once a filter
 *   is active; with no filter, every room is kept so the layout stays recognisable.
 * - groupBy 'category' and 'bridge' build one group per value, in first-seen order
 *   (category order for categories).
 * - groupBy 'floor' builds one group per floor in saved order, then 'Other' for rooms on no floor.
 * - groupBy 'none' returns a single group.
 * - sortBy 'manual' keeps layout order (room order, then layout order within a room).
 */
export function groupAndSort(
  rooms: RoomInput[],
  state: AccessoryFilterState,
  batteryIndex: Map<string, BatteryInfo>,
  context: FilterContext = {},
): AccessoryGroup[] {
  const filterActive = isFilterActive(state)

  // Filtered services per room, in layout order
  const perRoom = rooms.map(room => ({
    name: room.name,
    services: room.services.filter(service => matchesFilter(service, room.name, state, batteryIndex, context)),
  }))

  if (state.groupBy === 'room') {
    return perRoom
      .filter(room => room.services.length > 0 || !filterActive)
      .map(room => ({
        key: room.name,
        label: room.name,
        services: sortServices(room.services, state.sortBy),
      }))
  }

  const all = perRoom.flatMap(room => room.services)

  if (state.groupBy === 'none') {
    return all.length
      ? [
          {
            key: 'all',
            label: '',
            services: sortServices(all, state.sortBy),
          },
        ]
      : []
  }

  const buckets = new Map<string, { label: string, services: ServiceTypeX[] }>()

  if (state.groupBy === 'floor') {
    // One group per floor, in saved order. The rooms on no floor go last, under 'Other'.
    const roomFloor = new Map<string, string>()
    for (const floor of context.floors ?? []) {
      for (const room of floor.rooms) {
        if (!roomFloor.has(room)) {
          roomFloor.set(room, `floor:${floor.name}`)
        }
      }
    }
    for (const floor of context.floors ?? []) {
      buckets.set(`floor:${floor.name}`, { label: floor.name, services: [] })
    }
    buckets.set(FLOOR_OTHER_KEY, { label: FLOOR_OTHER_LABEL_KEY, services: [] })
    for (const room of perRoom) {
      const key = roomFloor.get(room.name) ?? FLOOR_OTHER_KEY
      buckets.get(key)!.services.push(...room.services)
    }
    return [
      ...buckets.entries(),
    ]
      .filter(([, bucket]) => bucket.services.length > 0)
      .map(([key, bucket]) => ({
        key,
        label: bucket.label,
        services: sortServices(bucket.services, state.sortBy),
      }))
  }

  if (state.groupBy === 'category') {
    for (const category of ACCESSORY_CATEGORIES) {
      buckets.set(category, { label: `accessories.categories.${category}`, services: [] })
    }
    for (const service of all) {
      buckets.get(getAccessoryCategory(service))!.services.push(service)
    }
    return [
      ...buckets.entries(),
    ]
      .filter(([, bucket]) => bucket.services.length > 0)
      .map(([key, bucket]) => ({
        key,
        label: bucket.label,
        services: sortServices(bucket.services, state.sortBy),
      }))
  }

  // groupBy 'bridge'
  for (const service of all) {
    const key = serviceBridgeKey(service)
    if (!buckets.has(key)) {
      buckets.set(key, {
        label: serviceBridgeName(service),
        services: [],
      })
    }
    buckets.get(key)!.services.push(service)
  }
  return [
    ...buckets.entries(),
  ]
    .map(([key, bucket]) => ({
      key,
      label: bucket.label,
      services: sortServices(bucket.services, state.sortBy),
    }))
}
