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

  private readonly onTouchStart = (event: TouchEvent) => {
    this.stopGlide()
    const touch = event.touches[0]
    this.tracking = event.touches.length === 1 && !!touch && this.isOnText(event.target)
    if (this.tracking) {
      this.lastY = touch.clientY
      this.lastTime = this.clock.now()
      this.speed = 0
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

    this.pendingPixels += this.speed * elapsed
    this.speed *= DECELERATION_PER_MS ** elapsed

    const lines = Math.trunc(this.pendingPixels / lineHeight)
    if (lines !== 0) {
      this.pendingPixels -= lines * lineHeight
      this.terminal.scrollLines(lines)
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

  private lineHeight(): number {
    const terminal = this.terminal
    return terminal?.element && terminal.rows > 0
      ? terminal.element.clientHeight / terminal.rows
      : 0
  }
}
