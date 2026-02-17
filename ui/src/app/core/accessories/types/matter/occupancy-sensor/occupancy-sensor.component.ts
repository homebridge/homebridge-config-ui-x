import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { getOccupancySensorState } from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-matter-occupancy-sensor',
  templateUrl: './occupancy-sensor.component.html',
  styleUrl: './occupancy-sensor.component.scss',
  standalone: true,
  imports: [
    TranslatePipe,
  ],
})
export class MatterOccupancySensorComponent {
  public readonly service = input.required<ServiceTypeX>()

  public readonly isOccupied = computed(() => getOccupancySensorState(this.service()))
}
