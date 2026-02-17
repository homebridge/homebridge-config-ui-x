import type { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { getAirQualityValue } from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  selector: 'app-matter-air-quality-sensor',
  imports: [TranslatePipe],
  standalone: true,
  templateUrl: './air-quality-sensor.component.html',
  styleUrl: './air-quality-sensor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatterAirQualitySensorComponent {
  public readonly service = input.required<ServiceTypeX>()

  public labels = ['Unknown', 'Good', 'Fair', 'Moderate', 'Poor', 'Very Poor', 'Extremely Poor']

  public readonly airQuality = computed(() => getAirQualityValue(this.service()))
}
