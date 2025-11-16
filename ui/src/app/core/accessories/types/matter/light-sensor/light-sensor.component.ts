import { DecimalPipe } from '@angular/common'
import { Component, Input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { getLightSensorIlluminance } from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  selector: 'app-matter-light-sensor',
  templateUrl: './light-sensor.component.html',
  standalone: true,
  imports: [
    DecimalPipe,
    TranslatePipe,
  ],
})
export class MatterLightSensorComponent {
  @Input() public service: ServiceTypeX

  public get illuminance(): number {
    return getLightSensorIlluminance(this.service)
  }
}
