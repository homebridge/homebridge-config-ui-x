import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-carbon-dioxide-sensor',
  templateUrl: './carbon-dioxide-sensor.component.html',
  styleUrl: './carbon-dioxide-sensor.component.scss',
  standalone: true,
  imports: [
    TranslatePipe,
  ],
})
export class CarbonDioxideSensorComponent {
  public service = input.required<ServiceTypeX>()
}
