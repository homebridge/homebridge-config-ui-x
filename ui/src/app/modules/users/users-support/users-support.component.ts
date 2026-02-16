import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

import { SupportBannerComponent } from '@/app/core/components/support-banner/support-banner.component'

@Component({
  selector: 'app-users-support',
  imports: [TranslatePipe, SupportBannerComponent],
  standalone: true,
  templateUrl: './users-support.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersSupportComponent {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }
}
