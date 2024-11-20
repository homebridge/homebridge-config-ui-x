import { ApiService } from '@/app/core/api.service'
import { Component, inject, Input } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

@Component({
  templateUrl: './restart-child-bridges.component.html',
  imports: [TranslatePipe],
})
export class RestartChildBridgesComponent {
  $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  @Input() bridges: { username: string, displayName: string }[] = []

  public async onRestartChildBridgeClick() {
    try {
      for (const bridge of this.bridges) {
        await firstValueFrom(this.$api.put(`/server/restart/${bridge.username}`, {}))
      }
      this.$toastr.success(
        this.$translate.instant('plugins.manage.child_bridge_restart'),
        this.$translate.instant('toast.title_success'),
      )
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('plugins.manage.child_bridge_restart_failed'), this.$translate.instant('toast.title_error'))
    } finally {
      this.$activeModal.close()
    }
  }
}
