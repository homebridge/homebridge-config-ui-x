import type { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

import type { BatteryInfo } from './accessory-battery'
import type { AccessoryCategory } from './accessory-categories'

import { ACCESSORY_CATEGORIES, getAccessoryCategory } from './accessory-categories'
import { isMatterService, isServiceNotResponding, isServiceOn, serviceBridgeKey, serviceBridgeName, serviceDisplayName } from './service-helpers'

export type AccessoryProtocol = 'hap' | 'matter'
export type AccessoryStateFilter = 'on' | 'notResponding'
export type AccessoryBatteryFilter = 'any' | 'low' | 'under20' | 'charging'
export type AccessoryGroupBy = 'room' | 'category' | 'bridge' | 'none'
export type AccessorySortBy = 'manual' | 'name' | 'category' | 'battery'

export interface AccessoryFilterState {
  search: string
  rooms: string[]
  categories: AccessoryCategory[]
  bridges: string[]
  protocols: AccessoryProtocol[]
  states: AccessoryStateFilter[]
  battery: AccessoryBatteryFilter[]
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

export const DEFAULT_FILTER_STATE: AccessoryFilterState = {
  search: '',
  rooms: [],
  categories: [],
  bridges: [],
  protocols: [],
  states: [],
  battery: [],
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
    || state.bridges.length > 0
    || state.protocols.length > 0
    || state.states.length > 0
    || state.battery.length > 0
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

function matchesBattery(filters: AccessoryBatteryFilter[], info: BatteryInfo | undefined): boolean {
  return filters.some((filter) => {
    if (filter === 'any') {
      return info !== undefined
    }
    if (!info) {
      return false
    }
    if (filter === 'low') {
      return info.low
    }
    if (filter === 'under20') {
      return info.low || (info.level !== undefined && info.level < 20)
    }
    return info.charging
  })
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
): boolean {
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
  if (state.states.length) {
    const stateMatch = state.states.some(filter => filter === 'on'
      ? isServiceOn(service)
      : isServiceNotResponding(service))
    if (!stateMatch) {
      return false
    }
  }
  if (state.battery.length && !matchesBattery(state.battery, batteryIndex.get(service.uniqueId ?? ''))) {
    return false
  }
  return true
}

/** Sort rank for battery: low without a level first, then by level, then no level, then no battery */
function batteryRank(info: BatteryInfo | undefined): [number, number] {
  if (!info) {
    return [3, 0]
  }
  if (info.level === undefined) {
    return info.low
      ? [0, 0]
      : [2, 0]
  }
  return [1, info.level]
}

function compareBattery(a: ServiceTypeX, b: ServiceTypeX, batteryIndex: Map<string, BatteryInfo>): number {
  const [groupA, valueA] = batteryRank(batteryIndex.get(a.uniqueId ?? ''))
  const [groupB, valueB] = batteryRank(batteryIndex.get(b.uniqueId ?? ''))
  return groupA - groupB || valueA - valueB
}

function compareName(a: ServiceTypeX, b: ServiceTypeX): number {
  return serviceDisplayName(a).localeCompare(serviceDisplayName(b), undefined, { numeric: true, sensitivity: 'base' })
}

function sortServices(services: ServiceTypeX[], sortBy: AccessorySortBy, batteryIndex: Map<string, BatteryInfo>): ServiceTypeX[] {
  const copy = [...services]
  switch (sortBy) {
    case 'name':
      return copy.sort(compareName)
    case 'category':
      return copy.sort((a, b) =>
        ACCESSORY_CATEGORIES.indexOf(getAccessoryCategory(a)) - ACCESSORY_CATEGORIES.indexOf(getAccessoryCategory(b))
        || compareName(a, b))
    case 'battery':
      return copy.sort((a, b) => compareBattery(a, b, batteryIndex))
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
 * - groupBy 'none' returns a single group.
 * - sortBy 'manual' keeps layout order (room order, then layout order within a room).
 */
export function groupAndSort(
  rooms: RoomInput[],
  state: AccessoryFilterState,
  batteryIndex: Map<string, BatteryInfo>,
): AccessoryGroup[] {
  const filterActive = isFilterActive(state)

  // Filtered services per room, in layout order
  const perRoom = rooms.map(room => ({
    name: room.name,
    services: room.services.filter(service => matchesFilter(service, room.name, state, batteryIndex)),
  }))

  if (state.groupBy === 'room') {
    return perRoom
      .filter(room => room.services.length > 0 || !filterActive)
      .map(room => ({
        key: room.name,
        label: room.name,
        services: sortServices(room.services, state.sortBy, batteryIndex),
      }))
  }

  const all = perRoom.flatMap(room => room.services)

  if (state.groupBy === 'none') {
    return all.length
      ? [
          {
            key: 'all',
            label: '',
            services: sortServices(all, state.sortBy, batteryIndex),
          },
        ]
      : []
  }

  const buckets = new Map<string, { label: string, services: ServiceTypeX[] }>()

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
        services: sortServices(bucket.services, state.sortBy, batteryIndex),
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
      services: sortServices(bucket.services, state.sortBy, batteryIndex),
    }))
}
