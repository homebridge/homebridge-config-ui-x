import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/communication/api.service'
import { RESTART_CHILD_BRIDGES_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { SettingsService } from '@/app/core/ui/settings.service'

@Component({
  selector: 'app-restart-child-bridges',
  imports: [TranslatePipe],
  standalone: true,
  templateUrl: './restart-child-bridges.component.html',
  styleUrl: './restart-child-bridges.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RestartChildBridgesComponent {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private modalData = inject(RESTART_CHILD_BRIDGES_MODAL_DATA)

  // Public properties (from injected data)
  public bridges = this.modalData.bridges

  // Other public properties
  public isMatterSupported = this.$settings.isFeatureEnabled('matterSupport')

  // Public methods
  public async onRestartChildBridgeClick(): Promise<void> {
    if (!this.bridges) {
      return
    }

    // Keep going when one bridge fails to restart - stopping at the first
    // failure used to leave the remaining bridges running old config
    let anyFailed = false
    for (const bridge of this.bridges) {
      try {
        await this.$api.put(`/server/restart/${bridge.username}`, {})
      } catch (error) {
        console.error(error)
        anyFailed = true
      }
    }
    if (anyFailed) {
      this.$toastr.error(this.$translate.instant('plugins.manage.child_bridge_restart_failed'), this.$translate.instant('toast.title_error'))
    } else {
      this.$toastr.success(
        this.$translate.instant('plugins.manage.child_bridge_restart'),
        this.$translate.instant('toast.title_success'),
      )
    }
    this.$activeModal.close()
  }

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }
}
