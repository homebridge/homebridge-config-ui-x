import { Component, inject, Input } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'

@Component({
  templateUrl: './confirm.component.html',
  standalone: true,
  imports: [TranslatePipe],
})
export class ConfirmComponent {
  private $activeModal = inject(NgbActiveModal)

  @Input() title: string
  @Input() message: string
  @Input() message2?: string
  @Input() message3?: string
  @Input() confirmButtonLabel?: string
  @Input() confirmButtonClass?: string
  @Input() faIconClass?: string

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  public closeModal() {
    this.$activeModal.close()
  }
}
