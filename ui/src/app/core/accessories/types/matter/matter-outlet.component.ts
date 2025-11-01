import { NgClass } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { SettingsService } from '@/app/core/settings.service'

@Component({
  selector: 'app-matter-outlet',
  templateUrl: './matter-outlet.component.html',
  styleUrls: ['./matter-outlet.component.scss'],
  standalone: true,
  imports: [
    NgClass,
    TranslatePipe,
  ],
})
export class MatterOutletComponent {
  $accessories = inject(AccessoriesService)
  private $settings = inject(SettingsService)

  @Input() public service: ServiceTypeX
  @Input() public readyForControl = false

  public browserLang = this.$settings.browserLang

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
      console.error('Failed to control Matter outlet:', error)
    })
  }

  public get isOn(): boolean {
    return this.service.clusters?.onOff?.onOff ?? false
  }
}
