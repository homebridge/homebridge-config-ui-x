import { Component, Input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-contact-sensor',
  templateUrl: './contact-sensor.component.html',
  styleUrls: ['./contact-sensor.component.scss'],
  standalone: true,
  imports: [
    TranslatePipe,
  ],
})
export class ContactSensorComponent {
  @Input() public service: ServiceTypeX
}
