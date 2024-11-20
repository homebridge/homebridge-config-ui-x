import { ApiService } from '@/app/core/api.service'
import { SettingsService } from '@/app/core/settings.service'
import { Component, inject, OnInit } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

@Component({
  templateUrl: './hb-update-confirm.component.html',
  imports: [
    TranslatePipe,
  ],
})
export class HbUpdateConfirmComponent implements OnInit {
  $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  public loading = true
  public installedPlugins: any = []
  public allPluginsSupported = true

  ngOnInit() {
    this.loadInstalledPlugins()
  }

  async loadInstalledPlugins() {
    this.installedPlugins = []
    this.loading = true
    const homebridgeVersion = this.$settings.env.homebridgeVersion.split('.')[0]

    try {
      const installedPlugins = await firstValueFrom(this.$api.get('/plugins'))
      this.installedPlugins = installedPlugins
        .filter((x: any) => x.name !== 'homebridge-config-ui-x')
        .map((x: any) => {
          const hbEngines = x.engines?.homebridge?.split('||').map((x: string) => x.trim()) || []
          const hb2Ready = homebridgeVersion === '2' ? 'hide' : hbEngines.some((x: string) => (x.startsWith('^2') || x.startsWith('>=2'))) ? 'supported' : 'unknown'
          if (hb2Ready === 'unknown') {
            this.allPluginsSupported = false
          }
          return {
            ...x,
            hb2Ready,
          }
        })

      this.loading = false
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('plugins.toast_failed_to_load_plugins'), this.$translate.instant('toast.title_error'))
    }
  }
}
