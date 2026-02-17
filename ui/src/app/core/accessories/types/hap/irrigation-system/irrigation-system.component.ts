import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-irrigation-system',
  imports: [
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './irrigation-system.component.html',
  styleUrl: './irrigation-system.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IrrigationSystemComponent {
  public readonly service = input.required<ServiceTypeX>()
}
