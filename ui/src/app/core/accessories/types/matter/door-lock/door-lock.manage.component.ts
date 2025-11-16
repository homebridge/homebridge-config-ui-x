import { NgClass } from '@angular/common'
import { Component, inject, Input, OnDestroy, OnInit } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { Subscription } from 'rxjs'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { getDoorLockState, setDoorLockState } from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  templateUrl: './door-lock.manage.component.html',
  standalone: true,
  imports: [
    TranslatePipe,
    NgClass,
  ],
})
export class DoorLockManageComponent implements OnInit, OnDestroy {
  private $activeModal = inject(NgbActiveModal)

  @Input() public service: ServiceTypeX
  @Input() public $accessories: AccessoriesService

  private stateSubscription: Subscription

  public targetMode: number

  public ngOnInit() {
    this.targetMode = getDoorLockState(this.service)

    // Subscribe to real-time accessory updates
    if (this.$accessories) {
      this.stateSubscription = this.$accessories.accessoryData.subscribe(() => {
        this.targetMode = getDoorLockState(this.service)
      })
    }
  }

  public ngOnDestroy() {
    if (this.stateSubscription) {
      this.stateSubscription.unsubscribe()
    }
  }

  public setTargetMode(value: number, event: MouseEvent) {
    this.targetMode = value
    const locked = value === 1
    setDoorLockState(this.service, locked)

    const target = event.target as HTMLButtonElement
    target.blur()
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }
}
