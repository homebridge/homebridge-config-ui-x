import { ChangeDetectionStrategy, Component, input } from '@angular/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-unknown',
  standalone: true,
  templateUrl: './unknown.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnknownComponent {
  public readonly service = input.required<ServiceTypeX>()
}
