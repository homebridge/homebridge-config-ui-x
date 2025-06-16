import { NgOptimizedImage } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

import { ApiService } from '@/app/core/api.service'
import { SettingsService } from '@/app/core/settings.service'
import { IoNamespace, WsService } from '@/app/core/ws.service'

@Component({
  templateUrl: './hb-v2-modal.component.html',
  standalone: true,
  imports: [
    TranslatePipe,
    NgOptimizedImage,
  ],
})
export class HbV2ModalComponent implements OnInit {
  $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)

  @Input() isUpdating: boolean = false

  public loading = true
  public installedPlugins: any = []
  public allPluginsSupported = true
  public homebridgeUiPkg = {} as any
  public nodeReady = false

  private io: IoNamespace

  constructor() {}

  async ngOnInit() {
    this.io = this.$ws.getExistingNamespace('status')
    if (this.io.socket.connected) {
      await this.checkHomebridgeUiVersion()
    }
    await this.loadInstalledPlugins()
    this.loading = false
  }

  async checkHomebridgeUiVersion() {
    try {
      this.homebridgeUiPkg = await firstValueFrom(this.io.request('homebridge-ui-version-check'))
      this.nodeReady = this.homebridgeUiPkg.readyForV5.node
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    }
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
        .sort((a, b) => a.name.localeCompare(b.name))

      // Skip if there are no plugins installed
      if (this.installedPlugins.length === 0) {
        this.$activeModal.close('update')
      }
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('plugins.toast_failed_to_load_plugins'), this.$translate.instant('toast.title_error'))
    }
  }
}
