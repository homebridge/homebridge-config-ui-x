import { DecimalPipe, UpperCasePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { SettingsService } from '@/app/core/ui/settings.service'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-temperature-sensor',
  templateUrl: './temperature-sensor.component.html',
  styleUrl: './temperature-sensor.component.scss',
  standalone: true,
  imports: [DecimalPipe, ConvertTempPipe, UpperCasePipe, TranslatePipe],
})
export class TemperatureSensorComponent {
  private $settings = inject(SettingsService)

  public service = input.required<ServiceTypeX>()

  public temperatureUnits = this.$settings.env.temperatureUnits
}
