import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-matter-generic-switch',
  imports: [
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './generic-switch.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatterGenericSwitchComponent {
  public readonly service = input.required<ServiceTypeX>()
}
