import { LowerCasePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { controlDevice, getDeviceActiveState } from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  selector: 'app-on-off-light-switch',
  imports: [
    LowerCasePipe,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './on-off-light-switch.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnOffLightSwitchComponent {
  public readonly service = input.required<ServiceTypeX>()
  public readonly readyForControl = input<boolean>(false)

  public onClick() {
    if (!this.readyForControl()) {
      return
    }

    controlDevice(this.service())
  }

  public readonly isOn = computed(() => getDeviceActiveState(this.service()))
}
