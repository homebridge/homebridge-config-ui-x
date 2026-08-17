import type { ComponentFixture } from '@angular/core/testing'

import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LongClickDirective } from '@/app/core/directives/long-click.directive'

/**
 * The directive that tells a tap apart from a long press. Every accessory tile
 * uses it: a tap toggles the accessory, a long press opens its manage modal.
 *
 * ⚠️ The rule that earns this spec is the **synthetic event guard**. A touch on
 * iOS fires `touchstart`/`touchend` and then, a moment later, a *second* pair of
 * `mousedown`/`mouseup` for the same finger. Without the guard every tap on an
 * iPhone toggles the accessory twice — on, then straight back off.
 */
@Component({
  selector: 'app-long-click-host',
  imports: [LongClickDirective],
  template: `<button type="button" [duration]="duration" (shortClick)="short = short + 1" (longClick)="long = long + 1">
  Tap me
</button>
`,
})
class HostComponent {
  public duration = 350
  public short = 0
  public long = 0
}

describe('longClickDirective', () => {
  let fixture: ComponentFixture<HostComponent>
  let host: HostComponent
  let button: HTMLElement

  function create(duration = 350) {
    TestBed.resetTestingModule()
    TestBed.configureTestingModule({ imports: [HostComponent] })

    fixture = TestBed.createComponent(HostComponent)
    host = fixture.componentInstance
    host.duration = duration
    fixture.detectChanges()
    button = fixture.nativeElement.querySelector('button')
    return host
  }

  /** A left mouse button press, unless another button is named. */
  function mouseDown(buttonNumber = 0) {
    button.dispatchEvent(new MouseEvent('mousedown', { button: buttonNumber, bubbles: true }))
  }

  function mouseUp() {
    button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  }

  function touchStart() {
    // jsdom has no TouchEvent constructor, and the directive only looks for a
    // `touches` property rather than the event's type
    const event = new Event('touchstart', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'touches', { value: [{ clientX: 0, clientY: 0 }] })
    button.dispatchEvent(event)
    return event
  }

  function touchEnd() {
    const event = new Event('touchend', { bubbles: true })
    Object.defineProperty(event, 'touches', { value: [] })
    button.dispatchEvent(event)
  }

  beforeEach(() => {
    vi.useFakeTimers()
    create()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('with a mouse', () => {
    it('reports a quick press as a tap', async () => {
      mouseDown()
      await vi.advanceTimersByTimeAsync(100)
      mouseUp()

      expect(host.short).toBe(1)
      expect(host.long).toBe(0)
    })

    it('reports a held press as a long press', async () => {
      mouseDown()
      await vi.advanceTimersByTimeAsync(350)

      expect(host.long).toBe(1)
      expect(host.short).toBe(0)
    })

    it('does not also report a tap when the button is finally released', async () => {
      // Otherwise a long press opens the modal AND toggles the accessory
      mouseDown()
      await vi.advanceTimersByTimeAsync(350)
      mouseUp()

      expect(host.long).toBe(1)
      expect(host.short).toBe(0)
    })

    it('waits the full duration, not a moment less', async () => {
      mouseDown()
      await vi.advanceTimersByTimeAsync(349)
      expect(host.long).toBe(0)

      await vi.advanceTimersByTimeAsync(1)
      expect(host.long).toBe(1)
    })

    it('honours a duration the host asked for', async () => {
      create(1000)

      mouseDown()
      await vi.advanceTimersByTimeAsync(400)
      expect(host.long).toBe(0)

      await vi.advanceTimersByTimeAsync(600)
      expect(host.long).toBe(1)
    })

    it('ignores a right click entirely', async () => {
      // The context menu belongs to the browser
      mouseDown(2)
      await vi.advanceTimersByTimeAsync(500)
      mouseUp()

      expect(host.long).toBe(0)
      expect(host.short).toBe(1)
    })

    it('cancels a pending long press when the pointer moves', async () => {
      // A drag across the accessory grid must not open a modal
      mouseDown()
      await vi.advanceTimersByTimeAsync(100)
      button.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
      await vi.advanceTimersByTimeAsync(500)

      expect(host.long).toBe(0)
    })

    it('reports no tap either once the pointer has moved', async () => {
      mouseDown()
      button.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
      mouseUp()

      expect(host.short).toBe(0)
      expect(host.long).toBe(0)
    })
  })

  describe('with a finger', () => {
    it('reports a quick tap as a tap', async () => {
      touchStart()
      await vi.advanceTimersByTimeAsync(100)
      touchEnd()

      expect(host.short).toBe(1)
      expect(host.long).toBe(0)
    })

    it('reports a held touch as a long press', async () => {
      touchStart()
      await vi.advanceTimersByTimeAsync(350)

      expect(host.long).toBe(1)
      expect(host.short).toBe(0)
    })

    it('does not also report a tap when the finger lifts', async () => {
      touchStart()
      await vi.advanceTimersByTimeAsync(350)
      touchEnd()

      expect(host.long).toBe(1)
      expect(host.short).toBe(0)
    })

    it('cancels a pending long press when the finger slides', async () => {
      // Scrolling the accessory list must not open a modal
      touchStart()
      await vi.advanceTimersByTimeAsync(100)
      button.dispatchEvent(new Event('touchmove', { bubbles: true }))
      await vi.advanceTimersByTimeAsync(500)

      expect(host.long).toBe(0)
    })

    it('leaves the page free to scroll on a browser that is not safari', () => {
      // preventDefault here would break scrolling everywhere else
      const event = touchStart()

      expect(event.defaultPrevented).toBe(false)
    })

    it('suppresses the synthetic events at source on mobile safari', () => {
      // Calling preventDefault on touchstart stops iOS replaying the touch as a
      // mouse event at all. It is only safe on Safari though, so the timing
      // guards below are what protect everyone else
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      )
      create()

      const event = touchStart()

      expect(event.defaultPrevented).toBe(true)
    })

    it('does not suppress them in chrome on ios', () => {
      // CriOS is not Safari, and preventing the default there would break
      // scrolling for those users
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1',
      )
      create()

      const event = touchStart()

      expect(event.defaultPrevented).toBe(false)
    })
  })

  describe('the synthetic events iOS fires after a touch', () => {
    it('ignores the mouse press that follows a tap', async () => {
      // iOS replays every touch as a mouse event a moment later. Counting both
      // means one tap toggles the accessory on and straight back off again
      touchStart()
      await vi.advanceTimersByTimeAsync(50)
      touchEnd()
      expect(host.short).toBe(1)

      // The replay, while the touch flag is still set
      await vi.advanceTimersByTimeAsync(50)
      mouseDown()
      mouseUp()

      expect(host.short).toBe(1)
      expect(host.long).toBe(0)
    })

    it('keeps ignoring mouse events for 300ms after the finger lifts', async () => {
      // ⚠️ The 150ms `touchInProgress` flag is NOT the whole protection, and the
      // difference is worth knowing precisely. The flag clears sooner than iOS
      // gets round to replaying the touch, so `isSyntheticEvent()` holds a wider
      // 300ms window open on top of it. That check has to be independent of the
      // flag: it used to read `touchInProgress && …` while both call sites
      // already tested `!touchInProgress` first, which made it unreachable and
      // left the 150ms flag as the only guard.
      touchStart()
      await vi.advanceTimersByTimeAsync(50)
      touchEnd()
      host.short = 0

      // t=250: past the flag, still inside the 300ms window
      await vi.advanceTimersByTimeAsync(200)
      mouseDown()
      mouseUp()

      expect(host.short).toBe(0)
    })

    it('starts accepting mouse events again the moment the window closes', async () => {
      touchStart()
      await vi.advanceTimersByTimeAsync(50)
      touchEnd()
      host.short = 0

      // t=349: one millisecond short of the window closing
      await vi.advanceTimersByTimeAsync(299)
      mouseDown()
      mouseUp()
      expect(host.short).toBe(0)

      await vi.advanceTimersByTimeAsync(1)
      mouseDown()
      mouseUp()
      expect(host.short).toBe(1)
    })

    it('ignores the mouse press that follows a long press', async () => {
      touchStart()
      await vi.advanceTimersByTimeAsync(350)
      touchEnd()
      expect(host.long).toBe(1)

      await vi.advanceTimersByTimeAsync(50)
      mouseDown()
      mouseUp()

      expect(host.long).toBe(1)
      expect(host.short).toBe(0)
    })

    it('ignores that replay even once the touch flag has cleared', async () => {
      // Why the window runs from the finger LIFTING rather than landing: a long
      // press outlasts 300ms on its own, so a window timed from touchstart would
      // already be shut by the time the replay arrives. Here the flag clears at
      // t=500 and the replay lands after it
      touchStart()
      await vi.advanceTimersByTimeAsync(350)
      touchEnd()
      expect(host.long).toBe(1)

      await vi.advanceTimersByTimeAsync(200)
      mouseDown()
      mouseUp()

      expect(host.short).toBe(0)
      expect(host.long).toBe(1)
    })

    it('accepts a real mouse press once the touch is long past', async () => {
      // A tablet with a keyboard and trackpad has to keep working
      touchStart()
      touchEnd()
      // Past both the 150ms touch flag and the 300ms synthetic window
      await vi.advanceTimersByTimeAsync(400)
      host.short = 0

      mouseDown()
      await vi.advanceTimersByTimeAsync(50)
      mouseUp()

      expect(host.short).toBe(1)
    })
  })

  describe('the keyboard', () => {
    it('reports Enter as a tap', () => {
      // The tile has to be usable without a pointer at all
      button.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))

      expect(host.short).toBe(1)
      expect(host.long).toBe(0)
    })
  })

  it('leaves no pending long press behind when the tile goes away', async () => {
    // ⚠️ Assert on the timer, not on the absence of an emit: Angular detaches
    // an `output()` subscription on destroy anyway, so "nothing was emitted"
    // stays true whether or not the timeout was cleared
    mouseDown()
    await vi.advanceTimersByTimeAsync(100)
    expect(vi.getTimerCount()).toBe(1)

    fixture.destroy()

    expect(vi.getTimerCount()).toBe(0)
  })

  it('reports nothing after the tile has gone', async () => {
    mouseDown()
    await vi.advanceTimersByTimeAsync(100)

    fixture.destroy()
    await vi.advanceTimersByTimeAsync(500)

    expect(host.long).toBe(0)
  })
})
