import { LowerCasePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { getHumiditySensorValue } from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  selector: 'app-matter-humidity-sensor',
  imports: [
    LowerCasePipe,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './humidity-sensor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatterHumiditySensorComponent {
  public readonly service = input.required<ServiceTypeX>()

  public readonly humidity = computed(() => getHumiditySensorValue(this.service()))
}
