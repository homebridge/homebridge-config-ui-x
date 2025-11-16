import { NgClass } from '@angular/common'
import { Component, Input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { isSmokeCoAlarmTriggered } from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  selector: 'app-matter-smoke-co-alarm',
  templateUrl: './smoke-co-alarm.component.html',
  styleUrls: ['./smoke-co-alarm.component.scss'],
  standalone: true,
  imports: [
    NgClass,
    TranslatePipe,
  ],
})
export class MatterSmokeCoAlarmComponent {
  @Input() public service: ServiceTypeX

  public get isTriggered(): boolean {
    return isSmokeCoAlarmTriggered(this.service)
  }
}
