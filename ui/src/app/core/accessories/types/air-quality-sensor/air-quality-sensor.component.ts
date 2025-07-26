import { NgClass } from '@angular/common'
import { Component, Input } from '@angular/core'
import { InlineSVGDirective } from 'ng-inline-svg-2'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-air-quality-sensor',
  templateUrl: './air-quality-sensor.component.html',
  styleUrls: ['./air-quality-sensor.component.scss'],
  standalone: true,
  imports: [NgClass, InlineSVGDirective],
})
export class AirQualitySensorComponent {
  @Input() public service: ServiceTypeX

  public labels = ['Unknown', 'Excellent', 'Good', 'Fair', 'Inferior', 'Poor']
}
