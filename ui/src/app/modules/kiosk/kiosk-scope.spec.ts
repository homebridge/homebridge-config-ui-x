import { describe, expect, it } from 'vitest'

import {
  describeScope,
  EMPTY_KIOSK_SCOPE,
  isEmptyScope,
  scopeFromFilter,
  scopeFromQuery,
  scopeKey,
  scopeToQuery,
  scopeToSearchParams,
} from '@/app/modules/kiosk/kiosk-scope'

/** Translates keys to readable text, as the app's translations would */
function translate(key: string): string {
  return ({
    'accessories.categories.lights': 'Lights',
    'accessories.subcategories.onoff': 'On/off',
    'kiosk.scope_all': 'All accessories',
  } as Record<string, string>)[key] ?? key
}

describe('kiosk scope', () => {
  it('reads each list from its repeated query param', () => {
    expect(scopeFromQuery({
      room: ['Kitchen', 'Hall'],
      category: 'lights',
      subcategory: 'onoff',
      label: 'Night',
    })).toEqual({
      rooms: ['Kitchen', 'Hall'],
      categories: ['lights'],
      subcategories: ['onoff'],
      labels: ['Night'],
    })
  })

  it('keeps a room name with a comma whole', () => {
    expect(scopeFromQuery({ room: 'Kitchen, Upper' }).rooms).toEqual(['Kitchen, Upper'])
  })

  it('keeps a room or label with & and # whole, through the URL', () => {
    const scope = {
      ...EMPTY_KIOSK_SCOPE,
      rooms: ['Bed & Bath', 'Den #2'],
      labels: ['A&B'],
    }
    const query = scopeToSearchParams(scope).toString()
    expect(query).toContain('room=Bed+%26+Bath')
    expect(query).toContain('room=Den+%232')
    const parsed = new URLSearchParams(query)
    expect(scopeFromQuery({
      room: parsed.getAll('room'),
      label: parsed.getAll('label'),
    })).toEqual({
      rooms: ['Bed & Bath', 'Den #2'],
      categories: [],
      subcategories: [],
      labels: ['A&B'],
    })
  })

  it('trims values, drops blanks and repeats', () => {
    expect(scopeFromQuery({
      room: [' Kitchen ', '', 'Kitchen'],
    }).rooms).toEqual(['Kitchen'])
  })

  it('writes only the lists that have values, as repeated router params', () => {
    expect(scopeToQuery({
      ...EMPTY_KIOSK_SCOPE,
      rooms: ['Kitchen, Upper', 'Hall'],
      labels: ['Night'],
    })).toEqual({
      room: ['Kitchen, Upper', 'Hall'],
      label: ['Night'],
    })
  })

  it('appends each value as its own param in the copied link', () => {
    const query = scopeToSearchParams({
      ...EMPTY_KIOSK_SCOPE,
      rooms: ['Kitchen, Upper', 'Hall'],
      categories: ['lights'],
      subcategories: ['dimmable'],
      labels: ['Night'],
    }).toString()
    expect(query).toBe('room=Kitchen%2C+Upper&room=Hall&category=lights&subcategory=dimmable&label=Night')
  })

  it('round-trips a scope through its query params', () => {
    const scope = {
      rooms: ['Kitchen, Upper', 'Bed & Bath'],
      categories: ['lights', 'climate'],
      subcategories: ['onoff'],
      labels: ['Night #1'],
    }
    const parsed = new URLSearchParams(scopeToSearchParams(scope).toString())
    expect(scopeFromQuery({
      room: parsed.getAll('room'),
      category: parsed.getAll('category'),
      subcategory: parsed.getAll('subcategory'),
      label: parsed.getAll('label'),
    })).toEqual(scope)
  })

  it('keys a scope the same however its values were picked', () => {
    const one = {
      ...EMPTY_KIOSK_SCOPE,
      rooms: ['Kitchen', 'Hall'],
      labels: ['b', 'a'],
    }
    const two = {
      ...EMPTY_KIOSK_SCOPE,
      rooms: ['Hall', 'Kitchen'],
      labels: ['a', 'b'],
    }
    expect(scopeKey(one)).toBe(scopeKey(two))
    expect(scopeKey(one)).toBe('room=Hall&room=Kitchen&label=a&label=b')
  })

  it('keys an empty scope with the empty string', () => {
    expect(scopeKey(EMPTY_KIOSK_SCOPE)).toBe('')
  })

  it('knows when a scope picks nothing', () => {
    expect(isEmptyScope(EMPTY_KIOSK_SCOPE)).toBe(true)
    expect(isEmptyScope({
      ...EMPTY_KIOSK_SCOPE,
      labels: ['x'],
    })).toBe(false)
  })

  it('takes the scope from the accessories filter, ignoring the rest of it', () => {
    expect(scopeFromFilter({
      rooms: ['Kitchen'],
      categories: ['lights'],
      subcategories: ['onoff'],
      labels: ['Bedtime'],
    })).toEqual({
      rooms: ['Kitchen'],
      categories: ['lights'],
      subcategories: ['onoff'],
      labels: ['Bedtime'],
    })
  })

  describe('describeScope', () => {
    it('names an empty scope as all accessories', () => {
      expect(describeScope(EMPTY_KIOSK_SCOPE, translate)).toBe('All accessories')
    })

    it('joins rooms, categories, subcategories and labels with a middle dot', () => {
      expect(describeScope({
        rooms: ['Kitchen', 'Living Room'],
        categories: ['lights'],
        subcategories: ['onoff'],
        labels: ['Bedtime'],
      }, translate)).toBe('Kitchen · Living Room · Lights · On/off · Bedtime')
    })

    it('names a scope with only rooms by those rooms', () => {
      expect(describeScope({
        ...EMPTY_KIOSK_SCOPE,
        rooms: ['Kitchen'],
      }, translate)).toBe('Kitchen')
    })
  })
})
