import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-carbon-monoxide-sensor',
  templateUrl: './carbon-monoxide-sensor.component.html',
  styleUrl: './carbon-monoxide-sensor.component.scss',
  standalone: true,
  imports: [
    TranslatePipe,
  ],
})
export class CarbonMonoxideSensorComponent {
  public readonly service = input.required<ServiceTypeX>()
}
