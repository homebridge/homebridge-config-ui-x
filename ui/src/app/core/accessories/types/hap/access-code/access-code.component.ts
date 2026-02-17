import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-access-code',
  templateUrl: './access-code.component.html',
  standalone: true,
  imports: [
    TranslatePipe,
  ],
})
export class AccessCodeComponent {
  public service = input.required<ServiceTypeX>()
  public readyForControl = input<boolean>(false)
}
