import { Component, Input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { getHumiditySensorValue } from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  selector: 'app-matter-humidity-sensor',
  templateUrl: './humidity-sensor.component.html',
  standalone: true,
  imports: [
    TranslatePipe,
  ],
})
export class MatterHumiditySensorComponent {
  @Input() public service: ServiceTypeX

  public get humidity(): number | null {
    return getHumiditySensorValue(this.service)
  }
}
