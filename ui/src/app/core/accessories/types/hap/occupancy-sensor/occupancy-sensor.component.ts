import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-occupancy-sensor',
  templateUrl: './occupancy-sensor.component.html',
  styleUrl: './occupancy-sensor.component.scss',
  standalone: true,
  imports: [
    TranslatePipe,
  ],
})
export class OccupancySensorComponent {
  public service = input.required<ServiceTypeX>()
}
