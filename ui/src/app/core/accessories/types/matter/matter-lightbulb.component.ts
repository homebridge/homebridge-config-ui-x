import { NgClass } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'

@Component({
  selector: 'app-matter-lightbulb',
  templateUrl: './matter-lightbulb.component.html',
  styleUrls: ['./matter-lightbulb.component.scss'],
  standalone: true,
  imports: [
    NgClass,
    TranslatePipe,
  ],
})
export class MatterLightbulbComponent {
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
      console.error('Failed to control Matter lightbulb:', error)
    })
  }

  public get isOn(): boolean {
    return this.service.clusters?.onOff?.onOff ?? false
  }

  public get brightness(): number {
    // Matter uses 0-254 for brightness
    const matterLevel = this.service.clusters?.levelControl?.currentLevel ?? 0
    // Convert to 0-100 percentage
    return Math.round((matterLevel / 254) * 100)
  }

  public get hasBrightness(): boolean {
    return !!this.service.clusters?.levelControl
  }

  public get hasColor(): boolean {
    return !!this.service.clusters?.colorControl
  }
}
