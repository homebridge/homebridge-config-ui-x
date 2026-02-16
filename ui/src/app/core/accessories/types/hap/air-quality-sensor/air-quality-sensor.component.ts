import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-air-quality-sensor',
  imports: [TranslatePipe],
  standalone: true,
  templateUrl: './air-quality-sensor.component.html',
  styleUrl: './air-quality-sensor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AirQualitySensorComponent {
  public readonly service = input.required<ServiceTypeX>()

  public labels = ['Unknown', 'Excellent', 'Good', 'Fair', 'Inferior', 'Poor']
}
