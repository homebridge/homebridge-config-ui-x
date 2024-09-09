import { ApiService } from '@/app/core/api.service'
import { Component } from '@angular/core'
import { Router } from '@angular/router'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

@Component({
  templateUrl: './unpair-all-bridges.component.html',
})
export class UnpairAllBridgesComponent {
  public clicked: boolean

  constructor(
    public activeModal: NgbActiveModal,
    public toastr: ToastrService,
    private translate: TranslateService,
    private $route: Router,
    private $api: ApiService,
  ) {}

  onResetHomebridgeAccessoryClick() {
    this.clicked = true
    return this.$api.put('/server/reset-homebridge-accessory', {}).subscribe(
      () => {
        this.toastr.success(this.translate.instant('reset.toast_accessory_reset'), this.translate.instant('toast.title_success'))
        this.activeModal.close()
        this.$route.navigate(['/restart'])
      },
      async () => {
        this.toastr.error(this.translate.instant('reset.toast_failed_to_reset'), this.translate.instant('toast.title_error'))
      },
    )
  }
}
