import { NgClass } from '@angular/common'
import { Component, Input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'
import { InlineSVGDirective } from 'ng-inline-svg-2'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-occupancy-sensor',
  templateUrl: './occupancy-sensor.component.html',
  styleUrls: ['./occupancy-sensor.component.scss'],
  standalone: true,
  imports: [
    NgClass,
    InlineSVGDirective,
    TranslatePipe,
  ],
})
export class OccupancySensorComponent {
  @Input() public service: ServiceTypeX
}
