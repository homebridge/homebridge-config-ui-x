import { Component, Input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-access-code',
  templateUrl: './access-code.component.html',
  standalone: true,
  imports: [
    TranslatePipe,
  ],
})
export class AccessCodeComponent {
  @Input() public service: ServiceTypeX
  @Input() public readyForControl = false
}
