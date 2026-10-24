import { LowerCasePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-battery',
  imports: [
    LowerCasePipe,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './battery.component.html',
  styleUrl: './battery.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BatteryComponent {
  public readonly service = input.required<ServiceTypeX>()

  /**
   * The translation key for the battery's charging state. A plain method rather
   * than computed(): the values are updated in place, so a computed() would
   * never see them change.
   */
  public chargingKey(isLow: boolean): string {
    switch (this.service().values?.ChargingState) {
      case 0:
        return 'accessories.control.battery_notcharging'
      case 1:
        return 'accessories.control.battery_charging'
      case 2:
        return 'accessories.control.battery_notchargeable'
      default:
        return isLow ? 'accessories.control.battery_low' : 'accessories.control.battery_charged'
    }
  }

  protected readonly Math = Math
}
