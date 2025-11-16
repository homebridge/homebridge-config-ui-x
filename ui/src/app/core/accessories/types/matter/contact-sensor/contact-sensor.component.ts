import { NgClass } from '@angular/common'
import { Component, Input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { getContactSensorState } from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  selector: 'app-matter-contact-sensor',
  templateUrl: './contact-sensor.component.html',
  styleUrls: ['./contact-sensor.component.scss'],
  standalone: true,
  imports: [
    NgClass,
    TranslatePipe,
  ],
})
export class MatterContactSensorComponent {
  @Input() public service: ServiceTypeX

  public get isOpen(): boolean {
    return getContactSensorState(this.service)
  }
}
