import { DecimalPipe, UpperCasePipe } from '@angular/common'
import { Component, computed, inject, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { getTemperatureSensorValue } from '@/app/core/accessories/types/matter/matter-device.utils'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { SettingsService } from '@/app/core/ui/settings.service'

@Component({
  selector: 'app-matter-temperature-sensor',
  templateUrl: './temperature-sensor.component.html',
  standalone: true,
  imports: [DecimalPipe, ConvertTempPipe, UpperCasePipe, TranslatePipe],
})
export class MatterTemperatureSensorComponent {
  private $settings = inject(SettingsService)

  public service = input.required<ServiceTypeX>()

  public temperatureUnits = this.$settings.env.temperatureUnits

  public temperature = computed(() => getTemperatureSensorValue(this.service()))
}
