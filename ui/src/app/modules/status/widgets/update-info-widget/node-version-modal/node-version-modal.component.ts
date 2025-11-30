import { Component, inject, OnInit, signal } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { NgxMdModule } from 'ngx-md'
import { ToastrService } from 'ngx-toastr'
import { satisfies } from 'semver'

import { ApiService } from '@/app/core/communication/api.service'
import { NODE_VERSION_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { InstalledPlugin } from '@/app/modules/status/widgets/update-info-widget/hb-v2-modal/hb-v2-modal.interfaces'
import { PluginNodeCheck } from '@/app/modules/status/widgets/widgets.interfaces'

@Component({
  templateUrl: './node-version-modal.component.html',
  standalone: true,
  imports: [
    TranslatePipe,
    NgxMdModule,
  ],
})
export class NodeVersionModalComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  // Inject modal data
  private modalData = inject(NODE_VERSION_MODAL_DATA)

  // Public properties (from injected data)
  public nodeVersion = this.modalData.nodeVersion
  public latestVersion = this.modalData.latestVersion
  public showNodeUnsupportedWarning = this.modalData.showNodeUnsupportedWarning
  public homebridgeRunningInSynologyPackage = this.modalData.homebridgeRunningInSynologyPackage
  public homebridgeRunningInDocker = this.modalData.homebridgeRunningInDocker
  public homebridgePkg = this.modalData.homebridgePkg
  public architecture = this.modalData.architecture
  public supportsNodeJs24 = this.modalData.supportsNodeJs24

  // Signals
  public loading = signal(true)
  public installedPlugins = signal<PluginNodeCheck[]>([])

  public ngOnInit(): void {
    void this.initialize()
  }

  private async initialize(): Promise<void> {
    await this.loadInstalledPlugins()
    this.loading.set(false)
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  private async loadInstalledPlugins() {
    this.installedPlugins.set([])

    try {
      const installedPlugins = await this.$api.get('/plugins')
      const processedPlugins = installedPlugins
        .map((x: any) => {
          const isSupported = x.engines?.node
            ? (satisfies(this.latestVersion, x.engines.node, { includePrerelease: true }) ? 'yes' : 'no')
            : 'unknown'

          return {
            displayName: x.displayName || x.name,
            name: x.name,
            isSupported,
            isSupportedStr: `status.widget.update_node_${isSupported}`,
          } as PluginNodeCheck
        })
        .sort((a: InstalledPlugin, b: InstalledPlugin) => {
          if (a.name === 'homebridge-config-ui-x') {
            return -1
          }
          if (b.name === 'homebridge-config-ui-x') {
            return 1
          }
          return a.name.localeCompare(b.name)
        })

      // Insert an item for Homebridge at the beginning of the list
      const hbIsSupported = satisfies(this.latestVersion, this.homebridgePkg.engines.node, { includePrerelease: true })
        ? 'yes'
        : 'no'
      processedPlugins.unshift({
        displayName: 'Homebridge',
        name: 'homebridge',
        isSupported: hbIsSupported,
        isSupportedStr: `status.widget.update_node_${hbIsSupported}`,
      })

      this.installedPlugins.set(processedPlugins)
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('plugins.toast_failed_to_load_plugins'), this.$translate.instant('toast.title_error'))
    }
  }
}
