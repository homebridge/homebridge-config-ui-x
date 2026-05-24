import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { Router } from '@angular/router'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { TtlCacheService } from '@/app/core/caching/ttl-cache.service'
import { ApiService } from '@/app/core/communication/api.service'

@Component({
  selector: 'app-reset-all-bridges',
  imports: [
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './reset-all-bridges.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetAllBridgesComponent {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $cache = inject(TtlCacheService)
  private $router = inject(Router)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  // Signals
  public readonly clicked = signal(false)
  public readonly confirmMode = signal(false)

  public toggleConfirmMode(event: MouseEvent): void {
    this.confirmMode.set(!this.confirmMode())
    ;(event.target as HTMLElement).blur()
  }

  public async onResetHomebridgeAccessoryClick(): Promise<void> {
    this.clicked.set(true)
    try {
      await this.$api.put('/server/reset-homebridge-accessory', {})
      this.$cache.invalidateAll()
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
