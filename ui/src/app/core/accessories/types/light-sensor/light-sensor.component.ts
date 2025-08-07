import { DecimalPipe } from '@angular/common'
import { Component, Input } from '@angular/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-light-sensor',
  templateUrl: './light-sensor.component.html',
  standalone: true,
  imports: [
    DecimalPipe,
  ],
})
export class LightSensorComponent {
  @Input() public service: ServiceTypeX
}
