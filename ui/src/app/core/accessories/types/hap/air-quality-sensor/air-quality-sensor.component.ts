import { Component, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-air-quality-sensor',
  templateUrl: './air-quality-sensor.component.html',
  styleUrl: './air-quality-sensor.component.scss',
  standalone: true,
  imports: [TranslatePipe],
})
export class AirQualitySensorComponent {
  public service = input.required<ServiceTypeX>()

  public labels = ['Unknown', 'Excellent', 'Good', 'Fair', 'Inferior', 'Poor']
}
