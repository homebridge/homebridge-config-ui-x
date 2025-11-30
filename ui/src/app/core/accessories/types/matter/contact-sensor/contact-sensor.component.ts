import { Component, computed, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { getContactSensorState } from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  selector: 'app-matter-contact-sensor',
  templateUrl: './contact-sensor.component.html',
  styleUrls: ['./contact-sensor.component.scss'],
  standalone: true,
  imports: [
    TranslatePipe,
  ],
})
export class MatterContactSensorComponent {
  public service = input.required<ServiceTypeX>()

  public isOpen = computed(() => getContactSensorState(this.service()))
}
