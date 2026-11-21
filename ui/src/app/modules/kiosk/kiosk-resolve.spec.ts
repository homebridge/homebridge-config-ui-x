import { describe, expect, it } from 'vitest'

import { getAccessorySubcategory } from '@/app/core/accessories/filters/accessory-categories'
import { hap } from '@/app/core/accessories/filters/accessory-filter.fixture'
import { resolveScopeUniqueIds } from '@/app/modules/kiosk/kiosk-resolve'
import { EMPTY_KIOSK_SCOPE } from '@/app/modules/kiosk/kiosk-scope'

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
        hap({ type: 'Switch', uniqueId: 'd', hidden: true }),
      ],
    },
  ]
}

describe('resolveScopeUniqueIds', () => {
  it('returns every visible service for an empty scope', () => {
    expect(resolveScopeUniqueIds(EMPTY_KIOSK_SCOPE, rooms()).sort()).toEqual(['a', 'b', 'c'])
  })

  it('narrows to the picked rooms', () => {
    expect(resolveScopeUniqueIds({
      ...EMPTY_KIOSK_SCOPE,
      rooms: ['Hall'],
    }, rooms())).toEqual(['c'])
  })

  it('narrows to the picked categories', () => {
    expect(resolveScopeUniqueIds({
      ...EMPTY_KIOSK_SCOPE,
      categories: ['lights'],
    }, rooms()).sort()).toEqual(['a', 'b'])
  })

  it('narrows to the picked subcategories within their categories', () => {
    const kind = getAccessorySubcategory(rooms()[0].services[0])
    const ids = resolveScopeUniqueIds({
      ...EMPTY_KIOSK_SCOPE,
      categories: ['lights'],
      subcategories: [kind],
    }, rooms())
    expect(ids).toContain('a')
    expect(ids).not.toContain('c')
  })

  it('narrows to services with any of the picked labels', () => {
    const labels = new Map([
      [
        'b',
        ['Bedtime'],
      ],
    ])
    expect(resolveScopeUniqueIds({
      ...EMPTY_KIOSK_SCOPE,
      labels: ['Bedtime'],
    }, rooms(), labels)).toEqual(['b'])
  })

  it('combines rooms and labels', () => {
    const labels = new Map([
      [
        'a',
        ['Bedtime'],
      ],
      [
        'c',
        ['Bedtime'],
      ],
    ])
    expect(resolveScopeUniqueIds({
      ...EMPTY_KIOSK_SCOPE,
      rooms: ['Kitchen'],
      labels: ['Bedtime'],
    }, rooms(), labels)).toEqual(['a'])
  })

  it('never includes hidden services, even when the scope would match them', () => {
    expect(resolveScopeUniqueIds({
      ...EMPTY_KIOSK_SCOPE,
      rooms: ['Hall'],
    }, rooms())).not.toContain('d')
  })

  it('returns nothing for an empty room list', () => {
    expect(resolveScopeUniqueIds(EMPTY_KIOSK_SCOPE, [])).toEqual([])
  })
})
