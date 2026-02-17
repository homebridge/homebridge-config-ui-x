import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-access-code',
  imports: [
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './access-code.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccessCodeComponent {
  public readonly service = input.required<ServiceTypeX>()
  public readonly readyForControl = input<boolean>(false)
}
