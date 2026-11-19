import { describe, expect, it } from 'vitest'

import { BUILT_IN_VIEWS } from '@/app/core/accessories/filters/accessory-views'

describe('BUILT_IN_VIEWS', () => {
  const view = (id: string) => BUILT_IN_VIEWS.find(v => v.id === id)!

  it('has the five built-in views in order', () => {
    expect(BUILT_IN_VIEWS.map(v => v.id)).toEqual([
      'favorites',
      'lights',
      'climate',
      'security',
      'batteries',
    ])
  })

  it('gives each view a translation key', () => {
    for (const v of BUILT_IN_VIEWS) {
      expect(v.labelKey).toBe(`accessories.views.${v.id}`)
    }
  })

  it('favorites shows dashboard services only', () => {
    expect(view('favorites').state).toEqual({ onDashboardOnly: true })
  })

  it('category views filter by category', () => {
    expect(view('lights').state.categories).toEqual(['lights'])
    expect(view('climate').state.categories).toEqual(['climate'])
    expect(view('security').state.categories).toEqual(['security'])
  })

  it('batteries shows battery services sorted by battery', () => {
    expect(view('batteries').state).toEqual({
      battery: ['any'],
      sortBy: 'battery',
    })
  })
})
