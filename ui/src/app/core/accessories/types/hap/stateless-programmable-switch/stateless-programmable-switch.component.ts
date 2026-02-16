import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-stateless-programmable-switch',
  imports: [TranslatePipe],
  standalone: true,
  templateUrl: './stateless-programmable-switch.component.html',
  styleUrl: './stateless-programmable-switch.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatelessProgrammableSwitchComponent {
  public readonly service = input.required<ServiceTypeX>()
}
