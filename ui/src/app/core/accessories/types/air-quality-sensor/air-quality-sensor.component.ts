import { NgClass } from '@angular/common'
import { Component, Input } from '@angular/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-air-quality-sensor',
  templateUrl: './air-quality-sensor.component.html',
  styleUrls: ['./air-quality-sensor.component.scss'],
  standalone: true,
  imports: [NgClass],
})
export class AirQualitySensorComponent {
  @Input() public service: ServiceTypeX

  public labels = ['Unknown', 'Excellent', 'Good', 'Fair', 'Inferior', 'Poor']
}
