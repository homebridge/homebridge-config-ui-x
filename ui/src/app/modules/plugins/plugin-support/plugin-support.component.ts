import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

import { SupportBannerComponent } from '@/app/core/components/support-banner/support-banner.component'

@Component({
  imports: [TranslatePipe, SupportBannerComponent],
  standalone: true,
  templateUrl: './plugin-support.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PluginSupportComponent {
  private $activeModal = inject(NgbActiveModal)

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }
}
