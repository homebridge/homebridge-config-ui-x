/* global NodeJS */
import { Directive, EventEmitter, HostListener, Input, OnDestroy, Output } from '@angular/core'

@Directive({
  selector: '[appLongclick]',
  standalone: true,
})
export class LongClickDirective implements OnDestroy {
  @Input() public duration = 350
  @Output() public longclick: EventEmitter<MouseEvent> = new EventEmitter()
  @Output() public shortclick: EventEmitter<MouseEvent | KeyboardEvent> = new EventEmitter()

  private downTimeout: NodeJS.Timeout
  private done = false

  constructor() {}

  @HostListener('keyup.enter', ['$event'])
  public onEnter(event: KeyboardEvent) {
    this.shortclick.emit(event)
  }

  @HostListener('mouseup', ['$event'])
  public onMouseUp(event: MouseEvent): void {
    clearInterval(this.downTimeout)
    if (!this.done) {
      this.done = true
      this.shortclick.emit(event)
    }
  }

  @HostListener('touchend', ['$event'])
  public onTouchEnd(event: MouseEvent): void {
    clearInterval(this.downTimeout)
    event.preventDefault()
    event.stopPropagation()
    if (!this.done) {
      this.done = true
      this.shortclick.emit(event)
    }
  }

  @HostListener('touchstart', ['$event'])
  @HostListener('mousedown', ['$event'])
  public onMouseDown(event: MouseEvent): void {
    // Check for the left mouse button (button 0)
    if (event.button !== 0) {
      return
    }
    this.done = false
    this.downTimeout = setTimeout(() => {
      this.done = true
      this.longclick.emit(event)
    }, this.duration)
  }

  @HostListener('mousemove', ['$event'])
  @HostListener('touchmove', ['$event'])
  public onMouseMove(): void {
    this.done = true
    clearInterval(this.downTimeout)
  }

  ngOnDestroy() {
    clearInterval(this.downTimeout)
  }
}
