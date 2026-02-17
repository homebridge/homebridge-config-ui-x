import { ChangeDetectionStrategy, Component, input } from '@angular/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-unknown',
  templateUrl: './unknown.component.html',
  standalone: true,
})
export class UnknownComponent {
  public service = input.required<ServiceTypeX>()
}
