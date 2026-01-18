/* global NodeJS */
import { Directive, HostListener, input, OnDestroy, output } from '@angular/core'

@Directive({
  selector: '[shortClick], [longClick]',
  standalone: true,
})
export class LongClickDirective implements OnDestroy {
  private downTimeout: NodeJS.Timeout
  private done = false
  private touchInProgress = false
  private touchStartTime = 0

  public readonly duration = input(350)

  public readonly longClick = output<MouseEvent | TouchEvent>()
  public readonly shortClick = output<MouseEvent | KeyboardEvent | TouchEvent>()

  @HostListener('keyup.enter', ['$event'])
  public onEnter(event: KeyboardEvent) {
    this.shortClick.emit(event)
  }

  @HostListener('mouseup', ['$event'])
  public onMouseUp(event: MouseEvent): void {
    if (!this.touchInProgress && !this.isSyntheticEvent()) {
      clearTimeout(this.downTimeout)
      if (!this.done) {
        this.done = true
        this.shortClick.emit(event)
      }
    }
  }

  @HostListener('touchend', ['$event'])
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

  @HostListener('touchstart', ['$event'])
  @HostListener('mousedown', ['$event'])
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

  @HostListener('mousemove')
  @HostListener('touchmove')
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
    return /iPad|iPhone|iPod/.test(userAgent) && /Safari/.test(userAgent) && !/Chrome|CriOS|FxiOS|EdgiOS/.test(userAgent)
  }

  public ngOnDestroy() {
    clearTimeout(this.downTimeout)
    this.touchInProgress = false
  }
}
