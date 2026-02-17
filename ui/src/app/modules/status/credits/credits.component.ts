import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

@Component({
  imports: [TranslatePipe],
  standalone: true,
  templateUrl: './credits.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreditsComponent {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }
}
