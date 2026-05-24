import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core'
import { Router } from '@angular/router'
import { NgbAlert } from '@ng-bootstrap/ng-bootstrap/alert'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { CachedAccessoriesCacheService } from '@/app/core/caching/cached-accessories-cache.service'
import { ServerPairingsCacheService } from '@/app/core/caching/server-pairings-cache.service'
import { ApiService } from '@/app/core/communication/api.service'
import { SettingsService } from '@/app/core/ui/settings.service'

@Component({
  selector: 'app-remove-all-accessories',
  imports: [
    NgbAlert,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './remove-all-accessories.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RemoveAllAccessoriesComponent implements OnInit {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)
  private $accessoryCache = inject(CachedAccessoriesCacheService)
  private $api = inject(ApiService)
  private $pairingsCache = inject(ServerPairingsCacheService)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  // Signals
  public readonly clicked = signal(false)
  public readonly cachedAccessories = signal<any[]>([])

  public ngOnInit(): void {
    void this.loadCachedAccessories()
  }

  public async onResetCachedAccessoriesClick(): Promise<void> {
    this.clicked.set(true)
    try {
      await this.$api.put('/server/reset-cached-accessories', {})
      this.$accessoryCache.invalidate()
      this.$pairingsCache.invalidate()
      this.$toastr.success(
        this.$translate.instant('reset.delete_success'),
        this.$translate.instant('toast.title_success'),
      )
      this.$activeModal.close()
      void this.$router.navigate(['/restart'], {
        queryParams: { restarting: true },
      })
    } catch (error) {
      this.clicked.set(false)
      console.error(error)
      this.$toastr.error(this.$translate.instant('reset.failed_to_reset'), this.$translate.instant('toast.title_error'))
    }
  }

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }

  private async loadCachedAccessories(): Promise<void> {
    try {
      const hapAccessories = await this.$accessoryCache.getHap<any[]>()

      // Also fetch Matter accessories if Matter support is enabled
      let matterAccessories: any[] = []
      if (this.$settings.isFeatureEnabled('matterSupport')) {
        try {
          matterAccessories = await this.$accessoryCache.getMatter<any[]>()
        } catch {
          // Matter endpoint may not be available — ignore
        }
      }

      this.cachedAccessories.set([...hapAccessories, ...matterAccessories])
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('reset.error_message'), this.$translate.instant('toast.title_error'))
      this.$activeModal.close()
    }
  }
}
