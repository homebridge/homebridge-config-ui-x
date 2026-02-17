import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { getHumiditySensorValue } from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-matter-humidity-sensor',
  templateUrl: './humidity-sensor.component.html',
  standalone: true,
  imports: [
    TranslatePipe,
  ],
})
export class MatterHumiditySensorComponent {
  public readonly service = input.required<ServiceTypeX>()

  public readonly humidity = computed(() => getHumiditySensorValue(this.service()))
}
