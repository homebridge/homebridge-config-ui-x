import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-contact-sensor',
  templateUrl: './contact-sensor.component.html',
  styleUrl: './contact-sensor.component.scss',
  standalone: true,
  imports: [
    TranslatePipe,
  ],
})
export class ContactSensorComponent {
  public service = input.required<ServiceTypeX>()
}
