import { LowerCasePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-motion-sensor',
  imports: [
    LowerCasePipe,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './motion-sensor.component.html',
  styleUrl: './motion-sensor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MotionSensorComponent {
  public readonly service = input.required<ServiceTypeX>()
}
