import { DecimalPipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-light-sensor',
  templateUrl: './light-sensor.component.html',
  standalone: true,
  imports: [
    DecimalPipe,
    TranslatePipe,
  ],
})
export class LightSensorComponent {
  public readonly service = input.required<ServiceTypeX>()
}
