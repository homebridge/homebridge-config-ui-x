import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-carbon-dioxide-sensor',
  imports: [
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './carbon-dioxide-sensor.component.html',
  styleUrl: './carbon-dioxide-sensor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CarbonDioxideSensorComponent {
  public readonly service = input.required<ServiceTypeX>()
}
