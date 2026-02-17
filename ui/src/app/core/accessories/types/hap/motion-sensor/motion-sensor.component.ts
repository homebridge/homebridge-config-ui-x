import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-motion-sensor',
  templateUrl: './motion-sensor.component.html',
  styleUrl: './motion-sensor.component.scss',
  standalone: true,
  imports: [
    TranslatePipe,
  ],
})
export class MotionSensorComponent {
  public readonly service = input.required<ServiceTypeX>()
}
