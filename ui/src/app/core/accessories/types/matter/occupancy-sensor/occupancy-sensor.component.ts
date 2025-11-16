import { NgClass } from '@angular/common'
import { Component, Input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { getOccupancySensorState } from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  selector: 'app-matter-occupancy-sensor',
  templateUrl: './occupancy-sensor.component.html',
  styleUrls: ['./occupancy-sensor.component.scss'],
  standalone: true,
  imports: [
    NgClass,
    TranslatePipe,
  ],
})
export class MatterOccupancySensorComponent {
  @Input() public service: ServiceTypeX

  public get isOccupied(): boolean {
    return getOccupancySensorState(this.service)
  }
}
