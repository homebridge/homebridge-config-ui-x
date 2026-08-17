import { describe, expect, it } from 'vitest'

import { UptimeWidgetComponent } from '@/app/modules/status/widgets/uptime-widget/uptime-widget.component'

/**
 * `humaniseDuration` is a pure function of its argument, so it is called off
 * the prototype rather than by booting the widget and its socket. The widget's
 * own wiring is covered by the component spec in a later phase.
 */
const humaniseDuration = (UptimeWidgetComponent.prototype as any).humaniseDuration as (seconds: number) => string

describe('UptimeWidgetComponent', () => {
  describe('humaniseDuration', () => {
    it.each([
      [0, '< 1m'],
      [49, '< 1m'],
      [50, '1m'],
      [59, '1m'],
      [90, '2m'],
      [3599, '60m'],
      [3600, '1h'],
      [86399, '24h'],
      [86400, '1d'],
      [200000, '2d'],
    ])('describes %i seconds as %s', (seconds, expected) => {
      expect(humaniseDuration(seconds)).toBe(expected)
    })

    it('switches away from "< 1m" at 50 seconds, not at 60', () => {
      // Rounding is what sets the boundary: 50s rounds up to 1m, so anything
      // below it would print "1m" while still being under a minute
      expect(humaniseDuration(49)).toBe('< 1m')
      expect(humaniseDuration(50)).toBe('1m')
    })

    it('rounds hours but truncates days', () => {
      // 90 minutes rounds up to 2h, while 1.9 days floors to 1d
      expect(humaniseDuration(5400)).toBe('2h')
      expect(humaniseDuration(164160)).toBe('1d')
    })
  })
})
