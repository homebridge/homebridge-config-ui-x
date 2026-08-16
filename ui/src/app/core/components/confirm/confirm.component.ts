import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

import { CONFIRM_MODAL_DATA } from '@/app/core/modal-data-tokens'

@Component({
  selector: 'app-confirm',
  imports: [TranslatePipe],
  standalone: true,
  templateUrl: './confirm.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmComponent {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)
  private modalData = inject(CONFIRM_MODAL_DATA)

  // Public properties (from injected data)
  public title = this.modalData.title
  public message = this.modalData.message
  public message2 = this.modalData.message2
  public message3 = this.modalData.message3
  public confirmButtonLabel = this.modalData.confirmButtonLabel
  public confirmButtonClass = this.modalData.confirmButtonClass
  public faIconClass = this.modalData.faIconClass

  // Public methods
  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }

  public closeModal(): void {
    this.$activeModal.close()
  }
}
