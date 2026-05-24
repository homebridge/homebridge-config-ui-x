import { DecimalPipe, LowerCasePipe, UpperCasePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { getTemperatureSensorValue } from '@/app/core/accessories/types/matter/matter-device.utils'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { SettingsService } from '@/app/core/ui/settings.service'

@Component({
  selector: 'app-matter-temperature-sensor',
  imports: [DecimalPipe, ConvertTempPipe, LowerCasePipe, UpperCasePipe, TranslatePipe],
  standalone: true,
  templateUrl: './temperature-sensor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatterTemperatureSensorComponent {
  private $settings = inject(SettingsService)

  public readonly service = input.required<ServiceTypeX>()

  public temperatureUnits = this.$settings.env.temperatureUnits

  public readonly temperature = computed(() => getTemperatureSensorValue(this.service()))
}
