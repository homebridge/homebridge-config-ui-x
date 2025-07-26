import { Component, inject, Input, OnInit } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { NgxMdModule } from 'ngx-md'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'
import { satisfies } from 'semver'

import { ApiService } from '@/app/core/api.service'
import { Plugin } from '@/app/core/manage-plugins/manage-plugins.interfaces'
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

  @Input() nodeVersion: string
  @Input() latestVersion: string
  @Input() showNodeUnsupportedWarning: boolean
  @Input() homebridgeRunningInSynologyPackage: boolean
  @Input() homebridgeRunningInDocker: boolean
  @Input() homebridgePkg: Plugin

  public loading = true
  public installedPlugins: PluginNodeCheck[] = []

  public async ngOnInit() {
    await this.loadInstalledPlugins()
    this.loading = false
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  private async loadInstalledPlugins() {
    this.installedPlugins = []

    try {
      const installedPlugins = await firstValueFrom(this.$api.get('/plugins'))
      this.installedPlugins = installedPlugins
        .map((x: any) => {
          const isSupported = x.engines?.node
            ? (satisfies(this.latestVersion, x.engines.node, { includePrerelease: true }) ? 'yes' : 'no')
            : 'unknown'

          return {
            displayName: x.displayName || x.name,
            name: x.name,
            isSupported,
            isSupportedStr: `status.widget.update_node_${isSupported}`,
          }
        })
        .sort((a, b) => {
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
      this.installedPlugins.unshift({
        displayName: 'Homebridge',
        name: 'homebridge',
        isSupported: hbIsSupported,
        isSupportedStr: `status.widget.update_node_${hbIsSupported}`,
      })
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('plugins.toast_failed_to_load_plugins'), this.$translate.instant('toast.title_error'))
    }
  }
}
