import { SettingsService } from '@/app/core/settings.service'
import { Directive, ElementRef, inject, Input, OnInit } from '@angular/core'

@Directive({
  selector: '[rtl]',
  standalone: true,
})
export class RtlDirective implements OnInit {
  private $settings = inject(SettingsService)
  private el = inject(ElementRef)

  @Input() rtl: string

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
