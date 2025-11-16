import { NgClass } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { DoorLockManageComponent } from '@/app/core/accessories/types/matter/door-lock/door-lock.manage.component'
import { getDoorLockState, toggleDoorLock } from '@/app/core/accessories/types/matter/matter-device.utils'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  selector: 'app-matter-door-lock',
  templateUrl: './door-lock.component.html',
  styleUrls: ['./door-lock.component.scss'],
  standalone: true,
  imports: [
    LongClickDirective,
    NgClass,
    TranslatePipe,
  ],
})
export class MatterDoorLockComponent {
  private $accessories = inject(AccessoriesService)
  private $modal = inject(NgbModal)

  @Input() public service: ServiceTypeX
  @Input() public readyForControl = false

  public onClick() {
    if (!this.readyForControl) {
      return
    }
    toggleDoorLock(this.service)
  }

  public onLongClick() {
    if (!this.readyForControl) {
      return
    }

    const ref = this.$modal.open(DoorLockManageComponent, {
      size: 'md',
      backdrop: 'static',
    })
    ref.componentInstance.service = this.service
    ref.componentInstance.$accessories = this.$accessories
  }

  public get lockState(): number {
    return getDoorLockState(this.service)
  }
}
