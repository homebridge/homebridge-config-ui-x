import { OnDestroy, Directive, EventEmitter, HostListener, Input, Output } from '@angular/core';

@Directive({
  selector: '[appLongclick]'
})
export class LongClickDirective implements OnDestroy {
  @Input() public duration = 300;
  @Output() public longclick: EventEmitter<MouseEvent> = new EventEmitter();
  @Output() public shortclick: EventEmitter<MouseEvent> = new EventEmitter();

  private downTimeout;
  private done = false;

  constructor() {}

  ngOnDestroy() {
    clearInterval(this.downTimeout);
  }

  @HostListener('touchend', ['$event'])
  @HostListener('mouseup', ['$event'])
  public onMouseUp(event: MouseEvent): void {
    clearInterval(this.downTimeout);
    event.preventDefault();
    event.stopPropagation();
    if (!this.done) {
      this.done = true;
      this.shortclick.emit(event);
    }
  }

  @HostListener('touchstart', ['$event'])
  @HostListener('mousedown', ['$event'])
  public onMouseDown(event: MouseEvent): void {
    this.done = false;
    this.downTimeout = setTimeout(() => {
      this.done = true;
      this.longclick.emit(event);
    }, this.duration);
  }
}
