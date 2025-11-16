import { NgClass } from '@angular/common'
import { Component, Input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-carbon-dioxide-sensor',
  templateUrl: './carbon-dioxide-sensor.component.html',
  styleUrls: ['./carbon-dioxide-sensor.component.scss'],
  standalone: true,
  imports: [
    NgClass,
    TranslatePipe,
  ],
})
export class CarbonDioxideSensorComponent {
  @Input() public service: ServiceTypeX
}
