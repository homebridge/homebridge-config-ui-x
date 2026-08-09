import { LowerCasePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { hasSmokeAlarm, isSmokeCoAlarmTriggered } from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  selector: 'app-matter-smoke-co-alarm',
  imports: [
    LowerCasePipe,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './smoke-co-alarm.component.html',
  styleUrl: './smoke-co-alarm.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatterSmokeCoAlarmComponent {
  public readonly service = input.required<ServiceTypeX>()

  public readonly isTriggered = computed(() => isSmokeCoAlarmTriggered(this.service()))

  /**
   * Both alarms live on one cluster and one Matter device type, but a plugin
   * can register either alarm on its own - so an accessory shown here may be a
   * carbon monoxide alarm that senses no smoke at all. Only the screen reader
   * name changes; the tile itself shows the accessory's own name.
   */
  public readonly typeKey = computed(() => hasSmokeAlarm(this.service())
    ? 'accessories.core.smoke_sensor'
    : 'accessories.core.carbon_monoxide_sensor')
}
