import { NgOptimizedImage } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'
import { satisfies } from 'semver'

import { PluginsCacheService } from '@/app/core/caching/plugins-cache.service'
import { IoNamespace, WsService } from '@/app/core/communication/ws.service'
import { HB_V2_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { SettingsService } from '@/app/core/ui/settings.service'
import { HttpErrorService } from '@/app/core/utilities/http-error.service'
import { InstalledPlugin } from '@/app/modules/status/widgets/update-info-widget/hb-v2-modal/hb-v2-modal.interfaces'

@Component({
  selector: 'app-hb-v2-modal',
  imports: [
    TranslatePipe,
    NgOptimizedImage,
  ],
  standalone: true,
  templateUrl: './hb-v2-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HbV2ModalComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)
  private $errors = inject(HttpErrorService)
  private $pluginsCache = inject(PluginsCacheService)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)
  private io!: IoNamespace

  // Inject modal data
  private modalData = inject(HB_V2_MODAL_DATA)

  // Public properties (from injected data)
  public isUpdating = this.modalData.isUpdating
  public skipIfCompatible = this.modalData.skipIfCompatible
  public defaultIcon = 'assets/hb-icon.png'

  // Signals
  public readonly loading = signal(true)
  public readonly installedPlugins = signal<InstalledPlugin[]>([])
  public readonly allPluginsSupported = signal(true)
  public readonly nodeReady = signal(false)

  public ngOnInit(): void {
    void this.initialize()
  }

  private async initialize(): Promise<void> {
    this.io = this.$ws.getExistingNamespace('status')
    if (this.io.socket.connected) {
      await this.checkHomebridgeUiVersion()
    }
    await this.loadInstalledPlugins()
    this.loading.set(false)
  }

  private async checkHomebridgeUiVersion() {
    try {
      const { nodeVersion } = await firstValueFrom(this.io.request('get-homebridge-server-info'))
      this.nodeReady.set(satisfies(nodeVersion, '>=22'))
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
    }
  }

  private async loadInstalledPlugins() {
    this.installedPlugins.set([])
    this.loading.set(true)
    const homebridgeVersion = this.$settings.env.homebridgeVersion!.split('.')[0]

    try {
      const installedPlugins = await this.$pluginsCache.get()
      const processedPlugins = installedPlugins
        .filter((x: any) => x.name !== 'homebridge-config-ui-x')
        .map((x: any) => {
          const hbEngines = x.engines?.homebridge?.split('||').map((x: string) => x.trim()) || []
          const hb2Ready = homebridgeVersion === '2' ? 'hide' : hbEngines.some((x: string) => (x.startsWith('^2') || x.startsWith('>=2'))) ? 'supported' : 'unknown'
          if (hb2Ready === 'unknown') {
            this.allPluginsSupported.set(false)
          }
          return {
            ...x,
            hb2Ready,
          } as InstalledPlugin
        })
        .sort((a: InstalledPlugin, b: InstalledPlugin) => a.name.localeCompare(b.name))

      this.installedPlugins.set(processedPlugins)

      // Skip if there are no plugins installed
      if (this.skipIfCompatible && this.installedPlugins().length === 0) {
        this.$activeModal.close('update')
      }
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('plugins.toast_failed_to_load_plugins'), this.$translate.instant('toast.title_error'))
    }
  }

  public handleIconError(plugin: InstalledPlugin) {
    plugin.icon = this.defaultIcon
  }

  public closeModal(reason: string) {
    this.$activeModal.close(reason)
  }
}
