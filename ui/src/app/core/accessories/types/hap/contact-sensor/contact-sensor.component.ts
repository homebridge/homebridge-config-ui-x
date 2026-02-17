import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-contact-sensor',
  imports: [
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './contact-sensor.component.html',
  styleUrl: './contact-sensor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactSensorComponent {
  public readonly service = input.required<ServiceTypeX>()
}
