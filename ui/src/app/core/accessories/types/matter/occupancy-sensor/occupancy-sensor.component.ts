import { Component, computed, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { getOccupancySensorState } from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  selector: 'app-matter-occupancy-sensor',
  templateUrl: './occupancy-sensor.component.html',
  styleUrls: ['./occupancy-sensor.component.scss'],
  standalone: true,
  imports: [
    TranslatePipe,
  ],
})
export class MatterOccupancySensorComponent {
  public service = input.required<ServiceTypeX>()

  public isOccupied = computed(() => getOccupancySensorState(this.service()))
}
