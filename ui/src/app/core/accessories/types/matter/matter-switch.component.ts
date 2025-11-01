import { NgClass } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'

@Component({
  selector: 'app-matter-switch',
  templateUrl: './matter-switch.component.html',
  styleUrls: ['./matter-switch.component.scss'],
  standalone: true,
  imports: [
    NgClass,
    TranslatePipe,
  ],
})
export class MatterSwitchComponent {
  $accessories = inject(AccessoriesService)

  @Input() public service: ServiceTypeX
  @Input() public readyForControl = false

  public onClick() {
    if (!this.readyForControl) {
      return
    }

    // Get current state from clusters
    const currentState = this.service.clusters?.onOff?.onOff ?? false
    const newState = !currentState

    // Control Matter accessory via IPC
    this.$accessories.controlMatterAccessory(
      this.service.uuid,
      'onOff',
      { onOff: newState },
      this.service.bridge?.username,
      this.service.partId,
    ).catch((error) => {
      console.error('Failed to control Matter switch:', error)
    })
  }

  public get isOn(): boolean {
    return this.service.clusters?.onOff?.onOff ?? false
  }
}
