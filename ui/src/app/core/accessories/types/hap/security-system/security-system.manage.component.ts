import { Component, inject, Input, OnDestroy, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { Subscription } from 'rxjs'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'

@Component({
  templateUrl: './security-system.manage.component.html',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
})
export class SecuritySystemManageComponent implements OnInit, OnDestroy {
  private $activeModal = inject(NgbActiveModal)

  @Input() public service: ServiceTypeX
  @Input() public $accessories: AccessoriesService

  public targetMode: any
  public targetModeValidValues: number[] = []
  private stateSubscription: Subscription

  public ngOnInit() {
    this.targetMode = this.service.values.SecuritySystemTargetState
    this.targetModeValidValues = this.service.getCharacteristic('SecuritySystemTargetState').validValues as number[]

    // Subscribe to state changes to update modal in real-time
    this.stateSubscription = this.$accessories.accessoryData.subscribe(() => {
      this.targetMode = this.service.values.SecuritySystemTargetState
    })
  }

  public setTargetMode(value: number, event: MouseEvent) {
    this.targetMode = value
    this.service.getCharacteristic('SecuritySystemTargetState').setValue(this.targetMode)

    const target = event.target as HTMLButtonElement
    target.blur()
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  public ngOnDestroy() {
    if (this.stateSubscription) {
      this.stateSubscription.unsubscribe()
    }
  }
}
