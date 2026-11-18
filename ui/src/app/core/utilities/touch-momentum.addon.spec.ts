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
  let scrollBy: ReturnType<typeof vi.spyOn>
  // Where the terminal is scrolled to: line 50 of 100, so it has lines to show both ways
  let buffer: { viewportY: number, baseY: number }
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
    scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    buffer = { viewportY: 50, baseY: 100 }
    addon = new TouchMomentumAddon(clock)
    addon.activate({
      element: host,
      rows: 30,
      scrollLines,
      buffer: { active: buffer },
    } as unknown as Terminal)
  })

  afterEach(() => {
    addon.dispose()
    host.remove()
    scrollBy.mockRestore()
  })

  /** How far the window was asked to move in all: above zero is down the page. */
  function pageMoved(): number {
    return (scrollBy.mock.calls as unknown[][]).reduce<number>((total, call) => total + (call[1] as number), 0)
  }

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

  /**
   * ⚠️ xterm claims every touch on the text as the finger lands, so the phone
   * never moves the page for a swipe on a terminal. Without the addon passing
   * the swipe on, a page with a terminal filling the screen cannot be moved at
   * all once the terminal is at its first or last line.
   */
  describe('when the terminal has no more lines to show', () => {
    /** Move the finger in steps without lifting it, so no glide follows. */
    function drag(target: Element, from: number, to: number, steps = 5): void {
      touch('touchstart', target, from)
      for (let step = 1; step <= steps; step++) {
        time += 16
        touch('touchmove', target, from + (to - from) * step / steps)
      }
    }

    it('moves the page down by the finger\'s travel on a swipe up at the last line', () => {
      buffer.viewportY = 100

      drag(text, 500, 300)

      expect(pageMoved()).toBe(200)
    })

    it('moves the page up by the finger\'s travel on a swipe down at the first line', () => {
      buffer.viewportY = 0

      drag(text, 300, 500)

      expect(pageMoved()).toBe(-200)
    })

    it('leaves the page alone while the terminal still has lines that way', () => {
      drag(text, 500, 300)
      drag(text, 300, 500)

      buffer.viewportY = 100
      // At the last line, a swipe down shows earlier lines: the terminal's own job
      drag(text, 300, 500)

      expect(scrollBy).not.toHaveBeenCalled()
    })

    it('moves the page both ways for a terminal with nothing to scroll', () => {
      buffer.viewportY = 0
      buffer.baseY = 0

      drag(text, 500, 300)
      expect(pageMoved()).toBe(200)

      drag(text, 300, 500)
      expect(pageMoved()).toBe(0)
    })

    it('moves what holds the terminal and scrolls, like a modal, before the window', () => {
      const modal = document.createElement('div')
      modal.style.overflowY = 'auto'
      host.replaceWith(modal)
      modal.append(host)
      Object.defineProperty(modal, 'clientHeight', { value: 400 })
      Object.defineProperty(modal, 'scrollHeight', { value: 1000 })
      modal.scrollTop = 0
      buffer.viewportY = 100

      drag(text, 500, 300)

      expect(modal.scrollTop).toBe(200)
      expect(scrollBy).not.toHaveBeenCalled()
      modal.replaceWith(host)
    })

    it('moves the window once what holds the terminal has reached its own end', () => {
      const modal = document.createElement('div')
      modal.style.overflowY = 'auto'
      host.replaceWith(modal)
      modal.append(host)
      Object.defineProperty(modal, 'clientHeight', { value: 400 })
      Object.defineProperty(modal, 'scrollHeight', { value: 1000 })
      modal.scrollTop = 600
      buffer.viewportY = 100

      drag(text, 500, 300)

      expect(modal.scrollTop).toBe(600)
      expect(pageMoved()).toBe(200)
      modal.replaceWith(host)
    })

    it('carries the glide of a flick on into the page', () => {
      buffer.viewportY = 100
      // The window follows the calls, so the glide has somewhere to go
      let scrollY = 0
      const scrollYSpy = vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scrollY)
      scrollBy.mockImplementation(((_x: number, y: number) => {
        scrollY += y
      }) as typeof window.scrollBy)

      flick(text, 500, 300)
      const lines = runGlide()
      scrollYSpy.mockRestore()

      // The flick itself is 200px; a phone's slow-down carries a flick this fast about 1200px more
      expect(lines).toBe(0)
      expect(pageMoved()).toBeGreaterThan(1000)
      expect(pageMoved()).toBeLessThan(1800)
    })

    it('ends the glide when the page has nowhere left to go', () => {
      buffer.viewportY = 100

      flick(text, 500, 300)
      time += 16
      frames.shift()!()

      // The window did not move (scrollY stayed at 0), so no further frame is asked for
      expect(frames).toHaveLength(0)
    })

    it('leaves the page alone for a drag of the scrollbar', () => {
      buffer.viewportY = 100

      drag(scrollbar, 500, 300)

      expect(scrollBy).not.toHaveBeenCalled()
    })
  })

  it('stops listening once it is disposed', () => {
    addon.dispose()

    flick(text, 500, 300)

    expect(runGlide()).toBe(0)
  })
})
