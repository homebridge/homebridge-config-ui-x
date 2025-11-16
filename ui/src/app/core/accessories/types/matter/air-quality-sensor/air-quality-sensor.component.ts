import type { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

import { NgClass } from '@angular/common'
import { Component, Input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { getAirQualityValue } from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  selector: 'app-matter-air-quality-sensor',
  templateUrl: './air-quality-sensor.component.html',
  styleUrls: ['./air-quality-sensor.component.scss'],
  standalone: true,
  imports: [NgClass, TranslatePipe],
})
export class MatterAirQualitySensorComponent {
  @Input() public service: ServiceTypeX

  public labels = ['Unknown', 'Good', 'Fair', 'Moderate', 'Poor', 'Very Poor', 'Extremely Poor']

  public get airQuality(): number {
    return getAirQualityValue(this.service)
  }
}
