import { Component, inject, Input } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'

import { TranslatePipe } from '@ngx-translate/core'

@Component({
  templateUrl: './information.component.html',
  imports: [TranslatePipe],
})
export class InformationComponent {
  $activeModal = inject(NgbActiveModal)

  @Input() title: string
  @Input() subtitle?: string
  @Input() message: string
  @Input() ctaButtonLabel?: string
  @Input() ctaButtonLink?: string
  @Input() faIconClass: string
}
