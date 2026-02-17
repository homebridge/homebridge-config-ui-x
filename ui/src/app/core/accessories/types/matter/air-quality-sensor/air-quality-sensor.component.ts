import type { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { getAirQualityValue } from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-matter-air-quality-sensor',
  templateUrl: './air-quality-sensor.component.html',
  styleUrl: './air-quality-sensor.component.scss',
  standalone: true,
  imports: [TranslatePipe],
})
export class MatterAirQualitySensorComponent {
  public service = input.required<ServiceTypeX>()

  public labels = ['Unknown', 'Good', 'Fair', 'Moderate', 'Poor', 'Very Poor', 'Extremely Poor']

  public airQuality = computed(() => getAirQualityValue(this.service()))
}
