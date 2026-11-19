import type { AccessoryView } from '@/app/core/accessories/filters/accessory-views'

import { describe, expect, it } from 'vitest'

import { hap } from '@/app/core/accessories/filters/accessory-filter.fixture'
import { findKioskView, resolveViewUniqueIds } from '@/app/modules/kiosk/kiosk-resolve'

function rooms() {
  return [
    {
      name: 'Kitchen',
      services: [
        hap({ type: 'Lightbulb', uniqueId: 'a', onDashboard: true }),
        hap({ type: 'Lightbulb', uniqueId: 'b' }),
      ],
    },
    {
      name: 'Hall',
      services: [
        hap({ type: 'Switch', uniqueId: 'c' }),
      ],
    },
  ]
}

describe('resolveViewUniqueIds', () => {
  it('returns every service for a view with no filter', () => {
    const view: AccessoryView = { id: 'v', name: 'All', state: {} }
    expect(resolveViewUniqueIds(view, rooms()).sort()).toEqual(['a', 'b', 'c'])
  })

  it('applies the view filter', () => {
    const view: AccessoryView = {
      id: 'v',
      name: 'Dash',
      state: { onDashboardOnly: true },
    }
    expect(resolveViewUniqueIds(view, rooms())).toEqual(['a'])
  })

  it('adds pinned services even when the filter does not match them', () => {
    const view: AccessoryView = {
      id: 'v',
      name: 'Dash',
      state: { onDashboardOnly: true },
      pinned: ['c'],
    }
    expect(resolveViewUniqueIds(view, rooms()).sort()).toEqual(['a', 'c'])
  })

  it('drops excluded services', () => {
    const view: AccessoryView = {
      id: 'v',
      name: 'All',
      state: {},
      excluded: ['b'],
    }
    expect(resolveViewUniqueIds(view, rooms()).sort()).toEqual(['a', 'c'])
  })

  it('returns nothing for an empty room list', () => {
    const view: AccessoryView = { id: 'v', name: 'All', state: {} }
    expect(resolveViewUniqueIds(view, [])).toEqual([])
  })
})

describe('findKioskView', () => {
  it('finds a built-in view by id', () => {
    expect(findKioskView('favorites', [])?.state).toEqual({ onDashboardOnly: true })
  })

  it('finds a saved view by id', () => {
    const saved: AccessoryView = { id: 'mine', name: 'Mine', state: {} }
    expect(findKioskView('mine', [saved])).toBe(saved)
  })

  it('returns undefined for an unknown id', () => {
    expect(findKioskView('nope', [])).toBeUndefined()
  })
})
