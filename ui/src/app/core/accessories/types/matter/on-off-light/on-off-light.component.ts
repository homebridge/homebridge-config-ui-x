import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { controlDevice, getDeviceActiveState } from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-on-off-light',
  templateUrl: './on-off-light.component.html',
  standalone: true,
  imports: [
    TranslatePipe,
  ],
})
export class OnOffLightComponent {
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
