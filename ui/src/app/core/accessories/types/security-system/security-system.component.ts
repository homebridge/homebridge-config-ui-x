import { NgClass } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { InlineSVGDirective } from 'ng-inline-svg-2'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { SecuritySystemManageComponent } from '@/app/core/accessories/types/security-system/security-system.manage.component'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  selector: 'app-security-system',
  templateUrl: './security-system.component.html',
  standalone: true,
  imports: [
    LongClickDirective,
    NgClass,
    InlineSVGDirective,
    TranslatePipe,
  ],
})
export class SecuritySystemComponent {
  private $modal = inject(NgbModal)

  @Input() public service: ServiceTypeX
  @Input() public readyForControl = false

  public onClick() {
    if (!this.readyForControl) {
      return
    }

    const ref = this.$modal.open(SecuritySystemManageComponent, {
      size: 'md',
      backdrop: 'static',
    })
    ref.componentInstance.service = this.service
  }
}
