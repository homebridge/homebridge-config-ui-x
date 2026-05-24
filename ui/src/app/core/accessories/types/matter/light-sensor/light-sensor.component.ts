import { DecimalPipe, LowerCasePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { getLightSensorIlluminance } from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  selector: 'app-matter-light-sensor',
  imports: [
    DecimalPipe,
    LowerCasePipe,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './light-sensor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatterLightSensorComponent {
  public readonly service = input.required<ServiceTypeX>()

  public readonly illuminance = computed(() => getLightSensorIlluminance(this.service()))
}
