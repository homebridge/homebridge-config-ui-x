import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { getContactSensorState } from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-matter-contact-sensor',
  templateUrl: './contact-sensor.component.html',
  styleUrl: './contact-sensor.component.scss',
  standalone: true,
  imports: [
    TranslatePipe,
  ],
})
export class MatterContactSensorComponent {
  public service = input.required<ServiceTypeX>()

  public isOpen = computed(() => getContactSensorState(this.service()))
}
