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
 * known which way it will move, so the phone never scrolls the page for a swipe
 * on a terminal: no bounce, and Safari's bars never shrink. A page moved by a
 * script instead does not feel like the phone's own scroll, and on a page the
 * terminal fills, like the logs, it has nowhere to go. So this addon takes the
 * touches on the text from xterm and decides at the finger's first move:
 * - towards lines the terminal still has, it scrolls the terminal itself
 * - towards its first or last line, with nothing left that way, it leaves the
 *   whole swipe to the phone, which scrolls or bounces the page as on any other
 * A swipe which reaches the end of the text part-way, once the terminal has it,
 * moves the page by script (whatever holds the terminal and scrolls, like a
 * modal, or else the window), as the phone cannot take a touch over mid-swipe.
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

/** Who moves for the current touch: not known until the finger first moves. */
type TouchOwner = 'undecided' | 'terminal' | 'phone'

/** Ahead of xterm, which listens on the document: on the window, in the capture phase. Not passive, to block the phone's scroll. */
const LISTENER_OPTIONS = { capture: true, passive: false } as const

export class TouchMomentumAddon implements ITerminalAddon {
  private terminal?: Terminal
  private frame?: number
  private tracking = false
  private owner: TouchOwner = 'undecided'
  private lastY = 0
  private lastTime = 0
  // Pixels per millisecond; above zero while the finger moves up, which shows later lines
  private speed = 0
  // Pixels scrolled by the finger or the glide which do not yet add up to a whole line
  private pendingPixels = 0
  // Pixels owed to the page which do not yet add up to a whole pixel
  private pendingPagePixels = 0
  // What holds the terminal and scrolls, nearest first, as found when the finger landed
  private scrollers: Element[] = []

  private readonly onTouchStart = (event: TouchEvent) => {
    this.stopGlide()
    const touch = event.touches[0]
    this.tracking = event.touches.length === 1 && !!touch && this.isOnText(event.target) && this.scrollsItsLines()
    if (this.tracking) {
      // Hidden from xterm, whose handler would claim the touch and so stop the phone from ever scrolling for it
      event.stopPropagation()
      this.owner = 'undecided'
      this.lastY = touch.clientY
      this.lastTime = this.clock.now()
      this.speed = 0
      this.pendingPixels = 0
      this.pendingPagePixels = 0
      this.scrollers = this.findScrollers()
    }
  }

  private readonly onTouchMove = (event: TouchEvent) => {
    const touch = event.touches[0]
    if (!this.tracking || !touch) {
      return
    }
    event.stopPropagation()
    const moved = this.lastY - touch.clientY
    if (this.owner === 'undecided' && moved !== 0) {
      // Decided once, at the first move: the phone can only take a touch over before it has been blocked
      this.owner = this.isAtLimit(moved)
        ? 'phone'
        : 'terminal'
    }
    if (this.owner !== 'terminal') {
      // The phone scrolls the page for this swipe, or the finger has not moved yet
      this.lastY = touch.clientY
      return
    }
    if (event.cancelable) {
      event.preventDefault()
    }
    const now = this.clock.now()
    const elapsed = now - this.lastTime
    if (elapsed > 0) {
      // Lean towards the newest sample, so one odd reading does not decide the speed
      const sample = (this.lastY - touch.clientY) / elapsed
      this.speed = this.speed * 0.4 + sample * 0.6
    }
    // The text follows the finger while the terminal has lines to show. Past its first or last line, the page moves
    if (moved !== 0) {
      const past = this.isAtLimit(moved)
        ? moved
        : this.scrollTerminal(moved)
      if (past !== 0) {
        this.pendingPixels = 0
        this.scrollPage(past)
      }
    }
    this.lastY = touch.clientY
    this.lastTime = now
  }

  private readonly onTouchEnd = (event: TouchEvent) => {
    if (!this.tracking) {
      return
    }
    event.stopPropagation()
    this.tracking = false
    if (this.owner !== 'terminal' || this.clock.now() - this.lastTime > MAX_REST_MS || Math.abs(this.speed) < MIN_SPEED) {
      return
    }
    this.pendingPixels = 0
    this.lastTime = this.clock.now()
    this.frame = this.clock.requestFrame(this.glide)
  }

  private readonly onTouchCancel = (event: TouchEvent) => {
    if (this.tracking) {
      event.stopPropagation()
    }
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
      const past = this.scrollTerminal(pixels)
      if (past !== 0 && !this.scrollPage(past)) {
        return
      }
    }
    if (Math.abs(this.speed) >= MIN_SPEED) {
      this.frame = this.clock.requestFrame(this.glide)
    }
  }

  constructor(private readonly clock: TouchMomentumClock = browserClock) {}

  public activate(terminal: Terminal): void {
    this.terminal = terminal
    // On the window, as the terminal has no element until it is opened, and so the touches on the
    // text reach this addon before they reach xterm
    window.addEventListener('touchstart', this.onTouchStart, LISTENER_OPTIONS)
    window.addEventListener('touchmove', this.onTouchMove, LISTENER_OPTIONS)
    window.addEventListener('touchend', this.onTouchEnd, LISTENER_OPTIONS)
    window.addEventListener('touchcancel', this.onTouchCancel, LISTENER_OPTIONS)
  }

  public dispose(): void {
    this.stopGlide()
    this.tracking = false
    this.terminal = undefined
    this.scrollers = []
    window.removeEventListener('touchstart', this.onTouchStart, LISTENER_OPTIONS)
    window.removeEventListener('touchmove', this.onTouchMove, LISTENER_OPTIONS)
    window.removeEventListener('touchend', this.onTouchEnd, LISTENER_OPTIONS)
    window.removeEventListener('touchcancel', this.onTouchCancel, LISTENER_OPTIONS)
  }

  private stopGlide(): void {
    if (this.frame !== undefined) {
      this.clock.cancelFrame(this.frame)
      this.frame = undefined
    }
  }

  /**
   * Scroll the terminal by a number of pixels, in whole lines: above zero shows later lines.
   * @returns the pixels which went past its first or last line, for the page
   */
  private scrollTerminal(pixels: number): number {
    const lineHeight = this.lineHeight()
    const buffer = this.terminal?.buffer.active
    if (!this.terminal || !buffer || !lineHeight) {
      return 0
    }
    this.pendingPixels += pixels
    const lines = Math.trunc(this.pendingPixels / lineHeight)
    if (lines === 0) {
      return 0
    }
    const room = lines > 0
      ? buffer.baseY - buffer.viewportY
      : -buffer.viewportY
    if (lines > 0
      ? lines <= room
      : lines >= room) {
      this.pendingPixels -= lines * lineHeight
      this.terminal.scrollLines(lines)
      return 0
    }
    if (room !== 0) {
      this.terminal.scrollLines(room)
    }
    const past = this.pendingPixels - room * lineHeight
    this.pendingPixels = 0
    return past
  }

  /**
   * Whether a swipe scrolls the terminal's own lines. A program with a full-screen view, like nano or
   * less, has no lines to scroll: xterm turns a swipe there into arrow keys, or into the mouse wheel for a
   * program which asked for the mouse. Those swipes stay xterm's.
   */
  private scrollsItsLines(): boolean {
    const terminal = this.terminal
    return terminal?.buffer.active.type === 'normal' && terminal.modes.mouseTrackingMode === 'none'
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
