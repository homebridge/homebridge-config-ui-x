import { LowerCasePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-occupancy-sensor',
  imports: [
    LowerCasePipe,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './occupancy-sensor.component.html',
  styleUrl: './occupancy-sensor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OccupancySensorComponent {
  public readonly service = input.required<ServiceTypeX>()
}
