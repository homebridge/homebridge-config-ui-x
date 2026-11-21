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
  let buffer: { viewportY: number, baseY: number, type: string }
  let modes: { mouseTrackingMode: string }
  let addon: TouchMomentumAddon

  /** A touch event with only what the addon reads. Returns it, to see whether its default was prevented. */
  function touch(type: string, target: Element, clientY?: number): Event {
    const touches = clientY === undefined
      ? []
      : [
          { clientY },
        ]
    const event = Object.assign(new Event(type, { bubbles: true, cancelable: true }), { touches })
    target.dispatchEvent(event)
    return event
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

    // The buffer follows the calls, as xterm's does, and stops at its first and last line
    scrollLines = vi.fn((lines: number) => {
      buffer.viewportY = Math.min(buffer.baseY, Math.max(0, buffer.viewportY + lines))
    })
    scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    buffer = { viewportY: 50, baseY: 100, type: 'normal' }
    modes = { mouseTrackingMode: 'none' }
    addon = new TouchMomentumAddon(clock)
    addon.activate({
      element: host,
      rows: 30,
      scrollLines,
      get buffer() {
        return { active: buffer }
      },
      modes,
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
    // The text followed the finger; only what comes after counts
    scrollLines.mockClear()

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

  it('follows the finger with the text while the terminal has lines that way', () => {
    // 200px of finger travel at 20px a line
    const moves: Event[] = []
    touch('touchstart', text, 500)
    for (let step = 1; step <= 5; step++) {
      time += 16
      moves.push(touch('touchmove', text, 500 - 40 * step))
    }

    expect(scrollLines.mock.calls.reduce((total, [lines]) => total + (lines as number), 0)).toBe(10)
    // The phone must not scroll the page as well
    expect(moves.every(event => event.defaultPrevented)).toBe(true)
  })

  /**
   * ⚠️ xterm claims every touch on the text as the finger lands, before it is
   * known which way it will move, so the phone never scrolled the page for a
   * swipe on a terminal (#3125). The addon takes those touches from xterm.
   */
  it('hides the touches on the text from xterm, which listens on the document', () => {
    const xterm = vi.fn()
    document.addEventListener('touchstart', xterm)
    document.addEventListener('touchmove', xterm)
    document.addEventListener('touchend', xterm)

    flick(text, 500, 300)
    expect(xterm).not.toHaveBeenCalled()

    // A drag of the scrollbar is still xterm's
    flick(scrollbar, 500, 300)
    expect(xterm).toHaveBeenCalled()

    document.removeEventListener('touchstart', xterm)
    document.removeEventListener('touchmove', xterm)
    document.removeEventListener('touchend', xterm)
  })

  /**
   * In a program with a full-screen view, like nano or less, xterm turns a
   * swipe into arrow keys, or into the mouse wheel for a program which asked
   * for the mouse. Those swipes must stay with xterm.
   */
  it.each([
    [
      'a full-screen program like nano',
      () => {
        buffer.type = 'alternate'
      },
    ],
    [
      'a program which asked for the mouse',
      () => {
        modes.mouseTrackingMode = 'any'
      },
    ],
  ])('leaves every swipe in %s to xterm', (_name, setUp) => {
    setUp()
    const xterm = vi.fn()
    document.addEventListener('touchmove', xterm)

    touch('touchstart', text, 500)
    time += 16
    const move = touch('touchmove', text, 300)
    touch('touchend', text)
    document.removeEventListener('touchmove', xterm)

    expect(xterm).toHaveBeenCalled()
    expect(move.defaultPrevented).toBe(false)
    expect(scrollLines).not.toHaveBeenCalled()
    expect(runGlide()).toBe(0)
  })

  describe('when the terminal has no more lines to show', () => {
    /** Move the finger in steps without lifting it, so no glide follows. Returns the moves. */
    function drag(target: Element, from: number, to: number, steps = 5): Event[] {
      touch('touchstart', target, from)
      const moves: Event[] = []
      for (let step = 1; step <= steps; step++) {
        time += 16
        moves.push(touch('touchmove', target, from + (to - from) * step / steps))
      }
      return moves
    }

    it('leaves a swipe up at the last line to the phone, which scrolls the page itself', () => {
      buffer.viewportY = 100

      const moves = drag(text, 500, 300)
      touch('touchend', text)

      expect(moves.some(event => event.defaultPrevented)).toBe(false)
      expect(scrollBy).not.toHaveBeenCalled()
      expect(runGlide()).toBe(0)
    })

    it('leaves a swipe down at the first line to the phone', () => {
      buffer.viewportY = 0

      const moves = drag(text, 300, 500)

      expect(moves.some(event => event.defaultPrevented)).toBe(false)
      expect(scrollLines).not.toHaveBeenCalled()
      expect(scrollBy).not.toHaveBeenCalled()
    })

    it('keeps a swipe the phone has for the whole swipe, even when it turns back', () => {
      buffer.viewportY = 100

      drag(text, 500, 300)
      time += 16
      const back = touch('touchmove', text, 450)

      expect(back.defaultPrevented).toBe(false)
      expect(scrollLines).not.toHaveBeenCalled()
    })

    it('scrolls the terminal for a swipe down at the last line, which shows earlier lines', () => {
      buffer.viewportY = 100

      const moves = drag(text, 300, 500)

      expect(moves.every(event => event.defaultPrevented)).toBe(true)
      expect(buffer.viewportY).toBe(90)
      expect(scrollBy).not.toHaveBeenCalled()
    })

    it('leaves a terminal with nothing to scroll to the phone both ways', () => {
      buffer.viewportY = 0
      buffer.baseY = 0

      expect(drag(text, 500, 300).some(event => event.defaultPrevented)).toBe(false)
      expect(drag(text, 300, 500).some(event => event.defaultPrevented)).toBe(false)
    })

    /**
     * A swipe which reaches the last line part-way has been blocked from the
     * phone since its first move, and the phone cannot take it over then. The
     * rest of it moves the page by script.
     */
    it('moves the page by script for the rest of a swipe which reaches the last line part-way', () => {
      buffer.viewportY = 95

      drag(text, 500, 300)

      // 5 lines (100px) to the last line, the other 100px to the page
      expect(buffer.viewportY).toBe(100)
      expect(pageMoved()).toBe(100)
    })

    it('moves what holds the terminal and scrolls, like a modal, before the window', () => {
      const modal = document.createElement('div')
      modal.style.overflowY = 'auto'
      host.replaceWith(modal)
      modal.append(host)
      Object.defineProperty(modal, 'clientHeight', { value: 400 })
      Object.defineProperty(modal, 'scrollHeight', { value: 1000 })
      modal.scrollTop = 0
      buffer.viewportY = 95

      drag(text, 500, 300)

      expect(modal.scrollTop).toBe(100)
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
      buffer.viewportY = 95

      drag(text, 500, 300)

      expect(modal.scrollTop).toBe(600)
      expect(pageMoved()).toBe(100)
      modal.replaceWith(host)
    })

    it('carries the glide of a flick on into the page once the terminal reaches its last line', () => {
      buffer.viewportY = 90
      // The window follows the calls, so the glide has somewhere to go
      let scrollY = 0
      const scrollYSpy = vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scrollY)
      scrollBy.mockImplementation(((_x: number, y: number) => {
        scrollY += y
      }) as typeof window.scrollBy)

      flick(text, 500, 300)
      runGlide()
      scrollYSpy.mockRestore()

      expect(buffer.viewportY).toBe(100)
      // The flick itself takes the terminal to its last line; a phone's slow-down carries a flick this fast about 1200px more
      expect(pageMoved()).toBeGreaterThan(1000)
      expect(pageMoved()).toBeLessThan(1800)
    })

    it('ends the glide when the page has nowhere left to go', () => {
      buffer.viewportY = 95

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
