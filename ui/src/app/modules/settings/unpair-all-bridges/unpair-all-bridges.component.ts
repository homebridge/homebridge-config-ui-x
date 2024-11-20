import { ApiService } from '@/app/core/api.service'
import { Component, inject } from '@angular/core'
import { Router } from '@angular/router'
import { NgbActiveModal, NgbAlert } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

@Component({
  templateUrl: './unpair-all-bridges.component.html',
  imports: [
    NgbAlert,
    TranslatePipe,
  ],
})
export class UnpairAllBridgesComponent {
  $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $route = inject(Router)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  public clicked: boolean

  onResetHomebridgeAccessoryClick() {
    this.clicked = true
    return this.$api.put('/server/reset-homebridge-accessory', {}).subscribe({
      next: () => {
        this.$toastr.success(this.$translate.instant('reset.accessory_reset'), this.$translate.instant('toast.title_success'))
        this.$activeModal.close()
        this.$route.navigate(['/restart'])
      },
      error: (error) => {
        console.error(error)
        this.$toastr.error(this.$translate.instant('reset.failed_to_reset'), this.$translate.instant('toast.title_error'))
      },
    })
  }
}
