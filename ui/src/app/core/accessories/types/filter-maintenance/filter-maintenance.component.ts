import { NgClass } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { InlineSVGDirective } from 'ng-inline-svg-2'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { FilterMaintenanceManageComponent } from '@/app/core/accessories/types/filter-maintenance/filter-maintenance.manage.component'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  selector: 'app-filter-maintenance',
  templateUrl: './filter-maintenance.component.html',
  standalone: true,
  imports: [
    InlineSVGDirective,
    NgClass,
    TranslatePipe,
    LongClickDirective,
  ],
})
export class FilterMaintenanceComponent {
  private $modal = inject(NgbModal)

  @Input() public service: ServiceTypeX
  @Input() public readyForControl = false

  public onClick() {
    if (!this.readyForControl) {
      return
    }

    const ref = this.$modal.open(FilterMaintenanceManageComponent, {
      size: 'md',
      backdrop: 'static',
    })
    ref.componentInstance.service = this.service
  }
}
