import { LowerCasePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-battery',
  imports: [
    LowerCasePipe,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './battery.component.html',
  styleUrl: './battery.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BatteryComponent {
  public readonly service = input.required<ServiceTypeX>()
  protected readonly Math = Math
}
