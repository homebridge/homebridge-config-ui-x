import { SettingsService } from '@/app/core/settings.service'
import { Directive, ElementRef, Input, OnInit } from '@angular/core'

@Directive({
  selector: '[rtl]',
})
export class RtlDirective implements OnInit {
  @Input() rtl: string

  constructor(
    private $settings: SettingsService,
    private el: ElementRef,
  ) {}

  ngOnInit() {
    if (this.$settings.rtl) {
      (this.el.nativeElement as HTMLElement).setAttribute('dir', 'rtl')
      if (this.rtl === 'right') {
        (this.el.nativeElement as HTMLElement).classList.add('text-right')
      } else if (this.rtl === 'left') {
        (this.el.nativeElement as HTMLElement).classList.add('text-left')
      }
    }
  }
}
