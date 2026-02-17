import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-carbon-monoxide-sensor',
  imports: [
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './carbon-monoxide-sensor.component.html',
  styleUrl: './carbon-monoxide-sensor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CarbonMonoxideSensorComponent {
  public readonly service = input.required<ServiceTypeX>()
}
