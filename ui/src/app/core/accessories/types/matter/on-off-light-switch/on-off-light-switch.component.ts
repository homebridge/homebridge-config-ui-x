import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { controlDevice, getDeviceActiveState } from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-on-off-light-switch',
  templateUrl: './on-off-light-switch.component.html',
  standalone: true,
  imports: [
    TranslatePipe,
  ],
})
export class OnOffLightSwitchComponent {
  public service = input.required<ServiceTypeX>()
  public readyForControl = input<boolean>(false)

  public onClick() {
    if (!this.readyForControl()) {
      return
    }

    controlDevice(this.service())
  }

  public isOn = computed(() => getDeviceActiveState(this.service()))
}
