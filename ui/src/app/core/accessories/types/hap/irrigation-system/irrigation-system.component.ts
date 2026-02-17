import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-irrigation-system',
  templateUrl: './irrigation-system.component.html',
  styleUrl: './irrigation-system.component.scss',
  standalone: true,
  imports: [
    TranslatePipe,
  ],
})
export class IrrigationSystemComponent {
  public readonly service = input.required<ServiceTypeX>()
}
