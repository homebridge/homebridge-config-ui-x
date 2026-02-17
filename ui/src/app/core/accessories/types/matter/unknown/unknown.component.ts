import { ChangeDetectionStrategy, Component, input } from '@angular/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-matter-unknown',
  templateUrl: './unknown.component.html',
  standalone: true,
})
export class MatterUnknownComponent {
  public readonly service = input.required<ServiceTypeX>()
}
