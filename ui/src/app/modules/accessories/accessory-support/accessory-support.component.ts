import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

import { SupportBannerComponent } from '@/app/core/components/support-banner/support-banner.component'

@Component({
  selector: 'app-accessory-support',
  imports: [TranslatePipe, SupportBannerComponent],
  standalone: true,
  templateUrl: './accessory-support.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccessorySupportComponent {
  private $activeModal = inject(NgbActiveModal)

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }
}
