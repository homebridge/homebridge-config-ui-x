import { describe, expect, it } from 'vitest'

import { ColourService } from '@/app/core/utilities/colour.service'

/**
 * Pull the three channels out of a `#rrggbb` string.
 * @param hex - the colour to split
 */
function channels(hex: string): { red: number, green: number, blue: number } {
  return {
    red: Number.parseInt(hex.slice(1, 3), 16),
    green: Number.parseInt(hex.slice(3, 5), 16),
    blue: Number.parseInt(hex.slice(5, 7), 16),
  }
}

describe('ColourService', () => {
  const service = new ColourService()

  describe('mired and kelvin', () => {
    it.each([
      [250, 4000],
      [500, 2000],
      [2000, 500],
      [4000, 250],
    ])('converts %i to %i', (input, expected) => {
      expect(service.kelvinToMired(input)).toBe(expected)
    })

    it('uses one formula for both directions, because the conversion is symmetric', () => {
      expect(service.miredToKelvin(370)).toBe(service.kelvinToMired(370))
    })

    it('loses a little to rounding on a round trip', () => {
      // 2700K rounds to 370 mireds, which converts back to 2703K. Harmless for
      // painting an icon, but a round trip is not an identity - do not rely on
      // one to decide whether a value changed
      expect(service.miredToKelvin(service.kelvinToMired(2700))).toBe(2703)
      expect(service.miredToKelvin(service.kelvinToMired(4000))).toBe(4000)
    })
  })

  describe('hueSaturationToHsl', () => {
    it('paints an unsaturated bulb white, not mid grey', () => {
      // The bug this guards: hue/saturation are HSV at full value, so feeding
      // them to hsl() at 50% lightness turns a white bulb grey
      expect(service.hueSaturationToHsl(0, 0)).toBe('hsl(0, 100%, 100%)')
    })

    it('paints a fully saturated bulb as the vivid hue', () => {
      expect(service.hueSaturationToHsl(120, 100)).toBe('hsl(120, 100%, 50%)')
    })

    it('lands pastels in between', () => {
      expect(service.hueSaturationToHsl(200, 50)).toBe('hsl(200, 100%, 75%)')
    })

    it('rounds both numbers', () => {
      expect(service.hueSaturationToHsl(120.6, 33)).toBe('hsl(121, 100%, 84%)')
    })
  })

  describe('kelvinToHex', () => {
    it('always returns a six digit hex colour', () => {
      for (const kelvin of [1000, 2700, 4000, 6600, 10000, 40000]) {
        expect(service.kelvinToHex(kelvin)).toMatch(/^#[0-9a-f]{6}$/)
      }
    })

    it('makes warm temperatures red-heavy and cool ones blue-heavy', () => {
      const warm = channels(service.kelvinToHex(2000))
      const cool = channels(service.kelvinToHex(10000))

      expect(warm.red).toBe(255)
      expect(warm.blue).toBeLessThan(warm.red)
      expect(cool.blue).toBe(255)
      expect(cool.red).toBeLessThan(255)
    })

    it('has no blue at all at the very bottom of the range', () => {
      // temp <= 19 (i.e. under 1900K) is hard-coded to zero blue
      expect(channels(service.kelvinToHex(1500)).blue).toBe(0)
    })

    it('gets bluer as the temperature rises', () => {
      const blues = [2000, 3000, 4000, 5000, 6000].map(k => channels(service.kelvinToHex(k)).blue)

      expect(blues).toEqual([...blues].sort((a, b) => a - b))
    })

    it('clamps out-of-range input instead of producing NaN', () => {
      expect(service.kelvinToHex(0)).toBe(service.kelvinToHex(1000))
      expect(service.kelvinToHex(-5000)).toBe(service.kelvinToHex(1000))
      expect(service.kelvinToHex(999999)).toBe(service.kelvinToHex(40000))
    })
  })

  describe('kelvinToHsl', () => {
    it('returns a well-formed hsl string', () => {
      expect(service.kelvinToHsl(4000)).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/)
    })

    it('clamps out-of-range input the same way kelvinToHex does', () => {
      // Without the clamp the logarithms below produce NaN
      expect(service.kelvinToHsl(0)).toBe(service.kelvinToHsl(1000))
      expect(service.kelvinToHsl(999999)).toBe(service.kelvinToHsl(40000))
      expect(service.kelvinToHsl(0)).not.toContain('NaN')
    })
  })
})
