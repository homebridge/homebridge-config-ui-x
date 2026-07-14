import { LowerCasePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { controlOnOffDevice, getOnOffState } from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  selector: 'app-matter-pump',
  imports: [
    LowerCasePipe,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './pump.component.html',
  styleUrl: './pump.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatterPumpComponent {
  public readonly service = input.required<ServiceTypeX>()
  public readonly readyForControl = input<boolean>(false)

  public readonly isOn = computed(() => getOnOffState(this.service()))

  public onClick() {
    if (!this.readyForControl()) {
      return
    }

    void controlOnOffDevice(this.service())
  }
}
