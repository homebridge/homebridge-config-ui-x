import { NgClass } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { InlineSVGDirective } from 'ng-inline-svg-2'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { LockMechanismManageComponent } from '@/app/core/accessories/types/lock-mechanism/lock-mechanism.manage.component'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  selector: 'app-lock-mechanism',
  templateUrl: './lock-mechanism.component.html',
  standalone: true,
  imports: [
    LongClickDirective,
    NgClass,
    InlineSVGDirective,
    TranslatePipe,
  ],
})
export class LockMechanismComponent {
  private $modal = inject(NgbModal)

  @Input() public service: ServiceTypeX
  @Input() public readyForControl = false

  public onClick() {
    if (!this.readyForControl) {
      return
    }
    if ('LockTargetState' in this.service.values) {
      this.service.getCharacteristic('LockTargetState').setValue(this.service.values.LockTargetState ? 0 : 1)
    } else if ('On' in this.service.values) {
      this.service.getCharacteristic('On').setValue(!this.service.values.On)
    }
  }

  public onLongClick() {
    if (!this.readyForControl) {
      return
    }

    if ('LockTargetState' in this.service.values) {
      const ref = this.$modal.open(LockMechanismManageComponent, {
        size: 'md',
        backdrop: 'static',
      })
      ref.componentInstance.service = this.service
    }
  }
}
