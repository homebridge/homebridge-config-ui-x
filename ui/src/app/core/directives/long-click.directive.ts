/* global NodeJS */
import { Directive, input, OnDestroy, output } from '@angular/core'

import { RE_IPAD_IPHONE_IPOD, RE_NON_SAFARI, RE_SAFARI } from '@/app/core/regex.constants'

@Directive({
  selector: '[shortClick], [longClick]',
  standalone: true,
  host: {
    '(keyup.enter)': 'onEnter($event)',
    '(mouseup)': 'onMouseUp($event)',
    '(touchend)': 'onTouchEnd($event)',
    '(touchstart)': 'onMouseDown($event)',
    '(mousedown)': 'onMouseDown($event)',
    '(mousemove)': 'onMouseMove()',
    '(touchmove)': 'onMouseMove()',
  },
})
export class LongClickDirective implements OnDestroy {
  private downTimeout!: NodeJS.Timeout
  private done = false
  private touchInProgress = false
  private lastTouchTime = 0

  public readonly duration = input(350)

  public readonly longClick = output<MouseEvent | TouchEvent>()
  public readonly shortClick = output<MouseEvent | KeyboardEvent | TouchEvent>()

  public onEnter(event: Event) {
    this.shortClick.emit(event as KeyboardEvent)
  }

  public onMouseUp(event: MouseEvent): void {
    if (!this.touchInProgress && !this.isSyntheticEvent()) {
      clearTimeout(this.downTimeout)
      if (!this.done) {
        this.done = true
        this.shortClick.emit(event)
      }
    }
  }

  public onTouchEnd(event: TouchEvent): void {
    clearTimeout(this.downTimeout)

    if (!this.done) {
      this.done = true
      this.shortClick.emit(event)
    }

    // The replay is timed from the finger lifting, not from it landing: a long
    // press outlasts the window on its own, so timing from touchstart would let
    // the replay through
    this.lastTouchTime = Date.now()

    setTimeout(() => {
      this.touchInProgress = false
    }, 150)
  }

  public onMouseDown(event: MouseEvent | TouchEvent): void {
    // Check for touch event by looking for touches property instead of instanceof
    if ('touches' in event) {
      this.touchInProgress = true
      this.done = false
      this.lastTouchTime = Date.now()

      if (event.cancelable && this.isSafariMobile()) {
        event.preventDefault()
      }

      this.downTimeout = setTimeout(() => {
        if (!this.done) {
          this.done = true
          this.longClick.emit(event)
        }
      }, this.duration())
      return
    }

    // If not a touch event, handle as mouse event
    if (!this.touchInProgress && !this.isSyntheticEvent()) {
      if ((event as MouseEvent).button === 0) {
        this.done = false
        this.downTimeout = setTimeout(() => {
          if (!this.done) {
            this.done = true
            this.longClick.emit(event)
          }
        }, this.duration())
      }
    }
  }

  public onMouseMove(): void {
    this.done = true
    clearTimeout(this.downTimeout)
  }

  /**
   * True while a mouse event is close enough to a touch to be iOS replaying it.
   * Deliberately independent of `touchInProgress`, which is cleared 150ms after
   * touchend - narrower than the replay this is here to block. Browsers on iOS
   * that are not Safari have no other protection, since `preventDefault()` on
   * touchstart is only safe to call there.
   */
  private isSyntheticEvent(): boolean {
    return Date.now() - this.lastTouchTime < 300
  }

  private isSafariMobile(): boolean {
    const userAgent = navigator.userAgent
    return RE_IPAD_IPHONE_IPOD.test(userAgent) && RE_SAFARI.test(userAgent) && !RE_NON_SAFARI.test(userAgent)
  }

  public ngOnDestroy() {
    clearTimeout(this.downTimeout)
    this.touchInProgress = false
  }
}
