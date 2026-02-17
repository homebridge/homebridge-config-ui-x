import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-battery',
  templateUrl: './battery.component.html',
  styleUrl: './battery.component.scss',
  standalone: true,
  imports: [
    TranslatePipe,
  ],
})
export class BatteryComponent {
  public readonly service = input.required<ServiceTypeX>()
  protected readonly Math = Math
}
