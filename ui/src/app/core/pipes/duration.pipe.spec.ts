import { describe, expect, it } from 'vitest'

import { DurationPipe } from '@/app/core/pipes/duration.pipe'

describe('DurationPipe', () => {
  const pipe = new DurationPipe()

  it('formats minutes and seconds', () => {
    expect(pipe.transform(90)).toBe('1m 30s')
  })

  it('omits the minutes part below one minute', () => {
    expect(pipe.transform(45)).toBe('45s')
  })

  it('omits the seconds part on a whole minute', () => {
    expect(pipe.transform(120)).toBe('2m')
  })

  it('returns an empty string for invalid input', () => {
    expect(pipe.transform(Number.NaN)).toBe('')
  })
})
