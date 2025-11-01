import { NgClass } from '@angular/common'
import { Component, Input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-carbon-monoxide-sensor',
  templateUrl: './carbon-monoxide-sensor.component.html',
  styleUrls: ['./carbon-monoxide-sensor.component.scss'],
  standalone: true,
  imports: [
    NgClass,
    TranslatePipe,
  ],
})
export class CarbonMonoxideSensorComponent {
  @Input() public service: ServiceTypeX
}
