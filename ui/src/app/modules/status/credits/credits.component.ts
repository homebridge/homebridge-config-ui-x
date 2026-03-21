import { Component, inject } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

@Component({
  templateUrl: './credits.component.html',
  standalone: true,
  imports: [TranslatePipe],
})
export class CreditsComponent {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }
}
