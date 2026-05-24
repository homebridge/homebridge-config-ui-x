import { LowerCasePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-humidity-sensor',
  imports: [
    LowerCasePipe,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './humidity-sensor.component.html',
  styleUrl: './humidity-sensor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HumiditySensorComponent {
  public readonly service = input.required<ServiceTypeX>()
}
