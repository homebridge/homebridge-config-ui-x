import { DecimalPipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-light-sensor',
  imports: [
    DecimalPipe,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './light-sensor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LightSensorComponent {
  public readonly service = input.required<ServiceTypeX>()
}
