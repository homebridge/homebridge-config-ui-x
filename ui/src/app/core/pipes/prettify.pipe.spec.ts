import { describe, expect, it } from 'vitest'

import { PrettifyPipe } from '@/app/core/pipes/prettify.pipe'

describe('PrettifyPipe', () => {
  const pipe = new PrettifyPipe()

  it.each([
    ['SMOKE_NOT_DETECTED', 'Smoke Not Detected'],
    ['colorTempPhysicalMaxMireds', 'Color Temp Physical Max Mireds'],
    ['onOff', 'On Off'],
    ['currentLevel', 'Current Level'],
    ['single', 'Single'],
  ])('turns %s into %s', (value, expected) => {
    expect(pipe.transform(value)).toBe(expected)
  })

  it('destroys acronyms, which is the accepted cost of one shared rule', () => {
    // HAP sends SCREAMING_SNAKE and Matter sends camelCase, and one pass has to
    // handle both. Lower-casing everything first is what loses the acronym
    expect(pipe.transform('CO2_DETECTED')).toBe('Co2 Detected')
    expect(pipe.transform('rgbColour')).toBe('Rgb Colour')
  })

  it('passes non-strings straight through', () => {
    expect(pipe.transform(null as any)).toBeNull()
    expect(pipe.transform(42 as any)).toBe(42)
  })

  it('returns an empty string unchanged', () => {
    expect(pipe.transform('')).toBe('')
  })
})
