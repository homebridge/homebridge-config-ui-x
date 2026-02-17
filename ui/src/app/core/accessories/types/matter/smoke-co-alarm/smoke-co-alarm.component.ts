import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { isSmokeCoAlarmTriggered } from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-matter-smoke-co-alarm',
  templateUrl: './smoke-co-alarm.component.html',
  styleUrl: './smoke-co-alarm.component.scss',
  standalone: true,
  imports: [
    TranslatePipe,
  ],
})
export class MatterSmokeCoAlarmComponent {
  public readonly service = input.required<ServiceTypeX>()

  public readonly isTriggered = computed(() => isSmokeCoAlarmTriggered(this.service()))
}
