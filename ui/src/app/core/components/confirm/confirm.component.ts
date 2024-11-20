import { Component, inject, Input } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'

import { TranslatePipe } from '@ngx-translate/core'

@Component({
  templateUrl: './confirm.component.html',
  imports: [TranslatePipe],
})
export class ConfirmComponent {
  $activeModal = inject(NgbActiveModal)

  @Input() title: string
  @Input() message: string
  @Input() confirmButtonLabel: string
  @Input() confirmButtonClass: string
  @Input() faIconClass: string
}
