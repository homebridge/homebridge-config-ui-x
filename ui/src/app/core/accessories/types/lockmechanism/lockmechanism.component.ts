import { NgClass } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { InlineSVGModule } from 'ng-inline-svg-2'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { LockmechanismManageComponent } from '@/app/core/accessories/types/lockmechanism/lockmechanism.manage.component'
import { LongClickDirective } from '@/app/core/directives/longclick.directive'

@Component({
  selector: 'app-lockmechanism',
  templateUrl: './lockmechanism.component.html',
  standalone: true,
  imports: [
    LongClickDirective,
    NgClass,
    InlineSVGModule,
    TranslatePipe,
  ],
})
export class LockmechanismComponent {
  @Input() public service: ServiceTypeX

  private $modal = inject(NgbModal)

  constructor() {}

  onClick() {
    this.service.getCharacteristic('LockTargetState').setValue(this.service.values.LockTargetState ? 0 : 1)
  }

  onLongClick() {
    const ref = this.$modal.open(LockmechanismManageComponent, {
      size: 'md',
      backdrop: 'static',
    })
    ref.componentInstance.service = this.service
  }
}
