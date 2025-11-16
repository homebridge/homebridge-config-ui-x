import { NgClass } from '@angular/common'
import { Component, Input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { controlDevice, getDeviceActiveState } from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  selector: 'app-on-off-light',
  templateUrl: './on-off-light.component.html',
  styleUrls: ['./on-off-light.component.scss'],
  standalone: true,
  imports: [
    NgClass,
    TranslatePipe,
  ],
})
export class OnOffLightComponent {
  @Input() public service: ServiceTypeX
  @Input() public readyForControl = false

  public onClick() {
    if (!this.readyForControl) {
      return
    }

    controlDevice(this.service)
  }

  public get isOn(): boolean {
    return getDeviceActiveState(this.service)
  }
}
