import { describe, expect, it } from 'vitest'

import { ConvertMiredPipe } from '@/app/core/pipes/convert-mired.pipe'

describe('ConvertMiredPipe', () => {
  const pipe = new ConvertMiredPipe()

  it.each([
    [500, '500M (2000K)'],
    [250, '250M (4000K)'],
    [147, '147M (6803K)'],
  ])('shows %i mireds with its kelvin equivalent', (mired, expected) => {
    expect(pipe.transform(mired)).toBe(expected)
  })

  it('rounds both halves', () => {
    expect(pipe.transform(370.4)).toBe('370M (2700K)')
  })

  it('leaves the kelvin off a reading of zero', () => {
    // ⚠️ Mireds are a reciprocal measure, so zero is an infinite colour
    // temperature and this used to read '0M (InfinityK)'. No real bulb reports
    // zero, but a plugin can report anything
    expect(pipe.transform(0)).toBe('0M')
  })

  it('leaves the kelvin off a negative reading too', () => {
    expect(pipe.transform(-100)).toBe('-100M')
  })

  it('passes non-numbers straight through', () => {
    expect(pipe.transform('warm')).toBe('warm')
    expect(pipe.transform(true)).toBe(true)
  })
})
