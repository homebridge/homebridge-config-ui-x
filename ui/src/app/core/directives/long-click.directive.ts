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
  private touchStartTime = 0

  public readonly duration = input(350)

  public readonly longClick = output<MouseEvent | TouchEvent>()
  public readonly shortClick = output<MouseEvent | KeyboardEvent | TouchEvent>()

  public onEnter(event: KeyboardEvent) {
    this.shortClick.emit(event)
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

    setTimeout(() => {
      this.touchInProgress = false
    }, 150)
  }

  public onMouseDown(event: MouseEvent | TouchEvent): void {
    // Check for touch event by looking for touches property instead of instanceof
    if ('touches' in event) {
      this.touchInProgress = true
      this.done = false
      this.touchStartTime = Date.now()

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

  private isSyntheticEvent(): boolean {
    const timeSinceTouch = Date.now() - this.touchStartTime
    return this.touchInProgress && timeSinceTouch < 300
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
