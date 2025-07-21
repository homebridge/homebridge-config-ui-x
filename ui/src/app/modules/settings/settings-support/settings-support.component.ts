import { Component, inject } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'

import { SupportBannerComponent } from '@/app/core/components/support-banner/support-banner.component'

@Component({
  templateUrl: './settings-support.component.html',
  standalone: true,
  imports: [TranslatePipe, SupportBannerComponent],
})
export class SettingsSupportComponent {
  private $activeModal = inject(NgbActiveModal)

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }
}
