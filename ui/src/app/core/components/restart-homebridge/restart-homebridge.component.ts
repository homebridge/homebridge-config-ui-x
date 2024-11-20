import { ApiService } from '@/app/core/api.service'
import { Component, inject, Input } from '@angular/core'
import { Router } from '@angular/router'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

@Component({
  templateUrl: './restart-homebridge.component.html',
  imports: [TranslatePipe],
})
export class RestartHomebridgeComponent {
  $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $router = inject(Router)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  @Input() fullRestart = false

  public onRestartHomebridgeClick() {
    if (!this.fullRestart) {
      this.$router.navigate(['/restart'])
      this.$activeModal.close()
      return
    }

    this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {}).subscribe({
      next: () => {
        this.$router.navigate(['/restart'])
        this.$activeModal.close()
      },
      error: (error) => {
        console.error(error)
        this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      },
    })
  }
}
