import { LowerCasePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { getOccupancySensorState } from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  selector: 'app-matter-occupancy-sensor',
  imports: [
    LowerCasePipe,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './occupancy-sensor.component.html',
  styleUrl: './occupancy-sensor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatterOccupancySensorComponent {
  public readonly service = input.required<ServiceTypeX>()

  public readonly isOccupied = computed(() => getOccupancySensorState(this.service()))
}
