import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-leak-sensor',
  imports: [
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './leak-sensor.component.html',
  styleUrl: './leak-sensor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LeakSensorComponent {
  public readonly service = input.required<ServiceTypeX>()
}
