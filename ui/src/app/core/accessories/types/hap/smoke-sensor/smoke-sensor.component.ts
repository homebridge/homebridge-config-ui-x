import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-smoke-sensor',
  imports: [
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './smoke-sensor.component.html',
  styleUrl: './smoke-sensor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SmokeSensorComponent {
  public readonly service = input.required<ServiceTypeX>()
}
