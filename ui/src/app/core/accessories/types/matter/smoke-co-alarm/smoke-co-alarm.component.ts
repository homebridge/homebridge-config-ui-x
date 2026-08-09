import { LowerCasePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { hasCoAlarm, hasSmokeAlarm, isSmokeCoAlarmTriggered } from '@/app/core/accessories/types/matter/matter-device.utils'

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
   * Both alarms share one cluster and one Matter device type, but a plugin can
   * register either on its own - so an accessory shown here may sense only
   * carbon monoxide, only smoke, or both. A combined alarm keeps the generic
   * "ALARM" face, which is what it is.
   */
  public readonly alarmKind = computed<'smoke' | 'co' | 'both'>(() => {
    const service = this.service()
    const smoke = hasSmokeAlarm(service)
    const co = hasCoAlarm(service)

    if (smoke && co) {
      return 'both'
    }
    // Matter requires at least one of the two, so a device claiming neither is
    // malformed - call it smoke, matching the SmokeSensor device type it came in under
    return co ? 'co' : 'smoke'
  })

  public readonly typeKey = computed(() => this.alarmKind() === 'co'
    ? 'accessories.core.carbon_monoxide_sensor'
    : 'accessories.core.smoke_sensor')
}
