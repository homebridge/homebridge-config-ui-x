import type { TouchMomentumClock } from '@/app/core/utilities/touch-momentum.addon'
import type { Terminal } from '@xterm/xterm'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TouchMomentumAddon } from '@/app/core/utilities/touch-momentum.addon'

/**
 * xterm 6 glides only a few lines after a flick on a touch screen, so the addon
 * carries the glide on (#3125). The clock is a fake one: each frame is 16ms.
 */
describe('TouchMomentumAddon', () => {
  const LINE_HEIGHT = 20
  let time: number
  let frames: Array<() => void>
  let clock: TouchMomentumClock
  let host: HTMLElement
  let text: HTMLElement
  let scrollbar: HTMLElement
  let scrollLines: ReturnType<typeof vi.fn>
  let addon: TouchMomentumAddon

  /** A touch event with only what the addon reads. */
  function touch(type: string, target: Element, clientY?: number): void {
    const touches = clientY === undefined
      ? []
      : [
          { clientY },
        ]
    target.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), { touches }))
  }

  /** Move the finger from `from` to `to` in steps of 16ms, then lift it. */
  function flick(target: Element, from: number, to: number, steps = 5): void {
    touch('touchstart', target, from)
    for (let step = 1; step <= steps; step++) {
      time += 16
      touch('touchmove', target, from + (to - from) * step / steps)
    }
    touch('touchend', target)
  }

  /** Run the glide to its end and return how many lines it scrolled in all. */
  function runGlide(): number {
    let guard = 0
    while (frames.length && guard++ < 2000) {
      time += 16
      frames.shift()!()
    }
    return scrollLines.mock.calls.reduce((total, [lines]) => total + (lines as number), 0)
  }

  beforeEach(() => {
    time = 1000
    frames = []
    clock = {
      now: () => time,
      requestFrame: (callback) => {
        frames.push(callback)
        return frames.length
      },
      cancelFrame: () => {
        frames = []
      },
    }

    host = document.createElement('div')
    text = document.createElement('div')
    scrollbar = document.createElement('div')
    scrollbar.className = 'xterm-scrollbar'
    host.append(text, scrollbar)
    document.body.append(host)
    // 30 rows of 20px
    Object.defineProperty(host, 'clientHeight', { value: 30 * LINE_HEIGHT })

    scrollLines = vi.fn()
    addon = new TouchMomentumAddon(clock)
    addon.activate({ element: host, rows: 30, scrollLines } as unknown as Terminal)
  })

  afterEach(() => {
    addon.dispose()
    host.remove()
  })

  it('keeps scrolling towards later lines after a flick upwards, far beyond the flick itself', () => {
    // 200px in 80ms: 2.5px per millisecond
    flick(text, 500, 300)

    const lines = runGlide()

    // The flick itself covered 10 lines; a phone's slow-down carries a flick this fast about 60 more
    expect(lines).toBeGreaterThan(40)
    expect(lines).toBeLessThan(80)
  })

  it('scrolls towards earlier lines after a flick downwards', () => {
    flick(text, 300, 500)

    expect(runGlide()).toBeLessThan(-40)
  })

  it('does not glide when the finger rested before it lifted', () => {
    touch('touchstart', text, 500)
    time += 16
    touch('touchmove', text, 300)
    time += 200
    touch('touchend', text)

    expect(runGlide()).toBe(0)
  })

  it('stops the glide when the screen is touched again', () => {
    flick(text, 500, 300)
    time += 16
    frames.shift()!()
    const soFar = scrollLines.mock.calls.length

    touch('touchstart', text, 400)

    expect(frames).toHaveLength(0)
    expect(scrollLines.mock.calls).toHaveLength(soFar)
  })

  it('leaves a drag of the scrollbar and a touch outside the terminal alone', () => {
    flick(scrollbar, 500, 300)
    flick(document.body, 500, 300)

    expect(runGlide()).toBe(0)
  })

  it('stops listening once it is disposed', () => {
    addon.dispose()

    flick(text, 500, 300)

    expect(runGlide()).toBe(0)
  })
})
