import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-stateless-programmable-switch',
  templateUrl: './stateless-programmable-switch.component.html',
  styleUrl: './stateless-programmable-switch.component.scss',
  standalone: true,
  imports: [TranslatePipe],
})
export class StatelessProgrammableSwitchComponent {
  public readonly service = input.required<ServiceTypeX>()
}
