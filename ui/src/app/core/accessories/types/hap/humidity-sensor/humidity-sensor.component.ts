import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-humidity-sensor',
  templateUrl: './humidity-sensor.component.html',
  styleUrl: './humidity-sensor.component.scss',
  standalone: true,
  imports: [
    TranslatePipe,
  ],
})
export class HumiditySensorComponent {
  public service = input.required<ServiceTypeX>()
}
