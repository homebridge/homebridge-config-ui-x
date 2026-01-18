import { Component, inject, signal } from '@angular/core'
import { Router } from '@angular/router'
import { NgbAlert } from '@ng-bootstrap/ng-bootstrap/alert'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/communication/api.service'

@Component({
  templateUrl: './reset-all-bridges.component.html',
  standalone: true,
  imports: [
    NgbAlert,
    TranslatePipe,
  ],
})
export class ResetAllBridgesComponent {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $router = inject(Router)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  // Signals
  public clicked = signal(false)

  public async onResetHomebridgeAccessoryClick(): Promise<void> {
    this.clicked.set(true)
    try {
      await this.$api.put('/server/reset-homebridge-accessory', {})
      this.$toastr.success(this.$translate.instant('reset.accessory_reset'), this.$translate.instant('toast.title_success'))
      this.$activeModal.close()
      void this.$router.navigate(['/restart'])
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('reset.failed_to_reset'), this.$translate.instant('toast.title_error'))
    }
  }

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }
}
