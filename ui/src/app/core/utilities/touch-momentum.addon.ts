import type { ITerminalAddon, Terminal } from '@xterm/xterm'

/**
 * Gives a terminal the long glide a phone gives any other page after a flick.
 *
 * xterm 6 scrolls a touch in code: the text follows the finger, and after the
 * finger lifts it glides for only a few lines, with a friction that has no
 * setting. A long log then takes dozens of swipes (#3125). This addon leaves
 * xterm's own handling alone and adds the rest of the glide on top: it watches
 * the same touches, works out how fast the finger was moving when it lifted,
 * and keeps scrolling with the slow-down a phone uses. A new touch stops it.
 *
 * xterm also claims every touch on the text as the finger lands, before it is
 * known which way it will move, so the phone never moves the page for a swipe
 * on a terminal. When the terminal has no more lines in the direction of the
 * swipe, this addon moves the page by the same amount instead: whatever holds
 * the terminal and scrolls (a modal), or else the window.
 */

/** How much of the speed is left after each millisecond: the rate iOS uses for a normal scroll view. */
const DECELERATION_PER_MS = 0.998

/** Below this speed (pixels per millisecond) the glide ends. */
const MIN_SPEED = 0.02

/** A finger which rested this long before lifting was placing the text, not flicking it. */
const MAX_REST_MS = 80

/** The frame clock, replaceable in a test. */
export interface TouchMomentumClock {
  now: () => number
  requestFrame: (callback: () => void) => number
  cancelFrame: (handle: number) => void
}

const browserClock: TouchMomentumClock = {
  now: () => performance.now(),
  requestFrame: callback => requestAnimationFrame(callback),
  cancelFrame: handle => cancelAnimationFrame(handle),
}

export class TouchMomentumAddon implements ITerminalAddon {
  private terminal?: Terminal
  private frame?: number
  private tracking = false
  private lastY = 0
  private lastTime = 0
  // Pixels per millisecond; above zero while the finger moves up, which shows later lines
  private speed = 0
  // Pixels scrolled by the glide which do not yet add up to a whole line
  private pendingPixels = 0
  // Pixels owed to the page which do not yet add up to a whole pixel
  private pendingPagePixels = 0
  // What holds the terminal and scrolls, nearest first, as found when the finger landed
  private scrollers: Element[] = []

  private readonly onTouchStart = (event: TouchEvent) => {
    this.stopGlide()
    const touch = event.touches[0]
    this.tracking = event.touches.length === 1 && !!touch && this.isOnText(event.target)
    if (this.tracking) {
      this.lastY = touch.clientY
      this.lastTime = this.clock.now()
      this.speed = 0
      this.pendingPagePixels = 0
      this.scrollers = this.findScrollers()
    }
  }

  private readonly onTouchMove = (event: TouchEvent) => {
    const touch = event.touches[0]
    if (!this.tracking || !touch) {
      return
    }
    const now = this.clock.now()
    const elapsed = now - this.lastTime
    if (elapsed > 0) {
      // Lean towards the newest sample, so one odd reading does not decide the speed
      const sample = (this.lastY - touch.clientY) / elapsed
      this.speed = this.speed * 0.4 + sample * 0.6
    }
    // xterm moves the text while it has lines to show. Past its first or last line, the page moves instead
    const moved = this.lastY - touch.clientY
    if (moved !== 0 && this.isAtLimit(moved)) {
      this.scrollPage(moved)
    }
    this.lastY = touch.clientY
    this.lastTime = now
  }

  private readonly onTouchEnd = () => {
    if (!this.tracking) {
      return
    }
    this.tracking = false
    if (this.clock.now() - this.lastTime > MAX_REST_MS || Math.abs(this.speed) < MIN_SPEED) {
      return
    }
    this.pendingPixels = 0
    this.lastTime = this.clock.now()
    this.frame = this.clock.requestFrame(this.glide)
  }

  private readonly onTouchCancel = () => {
    this.tracking = false
    this.stopGlide()
  }

  private readonly glide = () => {
    this.frame = undefined
    const lineHeight = this.lineHeight()
    if (!this.terminal || !lineHeight) {
      return
    }
    const now = this.clock.now()
    const elapsed = now - this.lastTime
    this.lastTime = now

    const pixels = this.speed * elapsed
    this.speed *= DECELERATION_PER_MS ** elapsed

    if (this.isAtLimit(pixels)) {
      // The terminal has reached its first or last line: the rest of the glide goes to the page
      this.pendingPixels = 0
      if (!this.scrollPage(pixels)) {
        return
      }
    } else {
      this.pendingPixels += pixels
      const lines = Math.trunc(this.pendingPixels / lineHeight)
      if (lines !== 0) {
        this.pendingPixels -= lines * lineHeight
        this.terminal.scrollLines(lines)
      }
    }
    if (Math.abs(this.speed) >= MIN_SPEED) {
      this.frame = this.clock.requestFrame(this.glide)
    }
  }

  constructor(private readonly clock: TouchMomentumClock = browserClock) {}

  public activate(terminal: Terminal): void {
    this.terminal = terminal
    // On the document, as the terminal has no element until it is opened. Passive: xterm's own
    // handler already keeps the page still, and this one only watches
    document.addEventListener('touchstart', this.onTouchStart, { passive: true })
    document.addEventListener('touchmove', this.onTouchMove, { passive: true })
    document.addEventListener('touchend', this.onTouchEnd, { passive: true })
    document.addEventListener('touchcancel', this.onTouchCancel, { passive: true })
  }

  public dispose(): void {
    this.stopGlide()
    this.tracking = false
    this.terminal = undefined
    this.scrollers = []
    document.removeEventListener('touchstart', this.onTouchStart)
    document.removeEventListener('touchmove', this.onTouchMove)
    document.removeEventListener('touchend', this.onTouchEnd)
    document.removeEventListener('touchcancel', this.onTouchCancel)
  }

  private stopGlide(): void {
    if (this.frame !== undefined) {
      this.clock.cancelFrame(this.frame)
      this.frame = undefined
    }
  }

  /** Whether the touch began on this terminal's text: a drag of the scrollbar is not a flick. */
  private isOnText(target: EventTarget | null): boolean {
    const element = this.terminal?.element
    return target instanceof Element && !!element?.contains(target) && !target.closest('.xterm-scrollbar')
  }

  /** Whether the terminal has no more lines to show in a direction: above zero is towards later lines. */
  private isAtLimit(direction: number): boolean {
    const buffer = this.terminal?.buffer.active
    if (!buffer) {
      return false
    }
    return direction > 0
      ? buffer.viewportY >= buffer.baseY
      : buffer.viewportY <= 0
  }

  /** Everything around the terminal which scrolls up and down, nearest first. The window is not in the list. */
  private findScrollers(): Element[] {
    const scrollers: Element[] = []
    let node = this.terminal?.element?.parentElement
    while (node && node !== document.body && node !== document.documentElement) {
      const overflowY = getComputedStyle(node).overflowY
      if (overflowY === 'auto' || overflowY === 'scroll') {
        scrollers.push(node)
      }
      node = node.parentElement
    }
    return scrollers
  }

  /**
   * Move the page by a number of pixels: above zero moves it down.
   * @returns false when nothing around the terminal can move any further that way
   */
  private scrollPage(pixels: number): boolean {
    this.pendingPagePixels += pixels
    const whole = Math.trunc(this.pendingPagePixels)
    if (whole === 0) {
      return true
    }
    this.pendingPagePixels -= whole

    const scroller = this.scrollers.find(element => whole > 0
      ? element.scrollTop + element.clientHeight < element.scrollHeight - 1
      : element.scrollTop > 0)
    if (scroller) {
      scroller.scrollTop += whole
      return true
    }
    const before = window.scrollY
    window.scrollBy(0, whole)
    return window.scrollY !== before
  }

  private lineHeight(): number {
    const terminal = this.terminal
    return terminal?.element && terminal.rows > 0
      ? terminal.element.clientHeight / terminal.rows
      : 0
  }
}
