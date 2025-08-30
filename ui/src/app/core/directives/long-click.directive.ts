/* global NodeJS */
import { Directive, HostListener, Input, OnDestroy, output } from '@angular/core'

@Directive({
  selector: '[shortClick], [longClick]',
  standalone: true,
})
export class LongClickDirective implements OnDestroy {
  private downTimeout: NodeJS.Timeout
  private done = false
  private touchHandled = false
  private lastTouchTime = 0

  @Input() public duration = 350

  public readonly longClick = output<MouseEvent | TouchEvent>()
  public readonly shortClick = output<MouseEvent | KeyboardEvent | TouchEvent>()

  @HostListener('keyup.enter', ['$event'])
  public onEnter(event: KeyboardEvent) {
    this.shortClick.emit(event)
  }

  @HostListener('mouseup', ['$event'])
  public onMouseUp(event: MouseEvent): void {
    // Ignore mouse events that are triggered after touch events
    if (this.isSyntheticMouseEvent()) {
      return
    }

    clearTimeout(this.downTimeout)
    if (!this.done) {
      this.done = true
      this.shortClick.emit(event)
    }
  }

  @HostListener('touchend', ['$event'])
  public onTouchEnd(event: TouchEvent): void {
    clearTimeout(this.downTimeout)

    // Only prevent default for Android Chrome/Edge which have issues with tap handling
    if (this.isAndroidChromium()) {
      event.preventDefault()
    }

    if (!this.done) {
      this.done = true
      this.touchHandled = true
      this.lastTouchTime = Date.now()
      this.shortClick.emit(event)
    }

    // Reset touch handled flag after a delay
    setTimeout(() => {
      this.touchHandled = false
    }, 100)
  }

  @HostListener('touchstart', ['$event'])
  @HostListener('mousedown', ['$event'])
  public onMouseDown(event: MouseEvent | TouchEvent): void {
    if (event instanceof TouchEvent) {
      this.done = false
      this.touchHandled = true
      this.lastTouchTime = Date.now()

      // Only prevent default for Android Chrome/Edge
      if (this.isAndroidChromium()) {
        event.preventDefault()
      }

      this.downTimeout = setTimeout(() => {
        if (!this.done) {
          this.done = true
          this.longClick.emit(event)
        }
      }, this.duration)
      return
    }

    if (event instanceof MouseEvent) {
      // Ignore synthetic mouse events from touch
      if (this.isSyntheticMouseEvent()) {
        return
      }

      // Check for the left mouse button (button 0)
      if (event.button !== 0) {
        return
      }

      this.done = false
      this.downTimeout = setTimeout(() => {
        if (!this.done) {
          this.done = true
          this.longClick.emit(event)
        }
      }, this.duration)
    }
  }

  @HostListener('mousemove', ['$event'])
  @HostListener('touchmove', ['$event'])
  public onMouseMove(): void {
    this.done = true
    clearTimeout(this.downTimeout)
  }

  private isSyntheticMouseEvent(): boolean {
    // Check if a mouse event occurred shortly after a touch event
    const timeSinceTouch = Date.now() - this.lastTouchTime
    return this.touchHandled && timeSinceTouch < 300
  }

  private isAndroidChromium(): boolean {
    const userAgent = navigator.userAgent.toLowerCase()
    // Check for Android and Chrome/Edge/Chromium-based browsers
    return /android/.test(userAgent) && (/chrome|crios|edg/.test(userAgent) || /chromium/.test(userAgent))
  }

  public ngOnDestroy() {
    clearTimeout(this.downTimeout)
  }
}
