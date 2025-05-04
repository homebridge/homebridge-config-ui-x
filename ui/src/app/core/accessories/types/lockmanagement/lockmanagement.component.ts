import { NgClass } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { InlineSVGModule } from 'ng-inline-svg-2'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { LockmanagementManageComponent } from '@/app/core/accessories/types/lockmanagement/lockmanagement.manage.component'
import { LongClickDirective } from '@/app/core/directives/longclick.directive'

@Component({
  selector: 'app-lockmechanism',
  templateUrl: './lockmanagement.component.html',
  standalone: true,
  imports: [
    LongClickDirective,
    NgClass,
    InlineSVGModule,
    TranslatePipe,
  ],
})
export class LockmanagementComponent {
  private $modal = inject(NgbModal)

  @Input() public service: ServiceTypeX

  constructor() {}

  onClick() {
    if ('LockManagementAutoSecurityTimeout' in this.service.values) {
      const ref = this.$modal.open(LockmanagementManageComponent, {
        size: 'md',
      })
      ref.componentInstance.service = this.service
    }
  }
}
