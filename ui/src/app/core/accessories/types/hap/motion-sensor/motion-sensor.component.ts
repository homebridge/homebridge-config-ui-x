import { Component, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-motion-sensor',
  templateUrl: './motion-sensor.component.html',
  styleUrls: ['./motion-sensor.component.scss'],
  standalone: true,
  imports: [
    TranslatePipe,
  ],
})
export class MotionSensorComponent {
  public service = input.required<ServiceTypeX>()
}
