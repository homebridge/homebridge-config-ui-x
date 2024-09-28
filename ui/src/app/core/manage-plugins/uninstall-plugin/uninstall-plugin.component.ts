import { ApiService } from '@/app/core/api.service'
import { ManagePluginComponent } from '@/app/core/manage-plugins/manage-plugin/manage-plugin.component'
import { Component, Input, OnInit } from '@angular/core'
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

@Component({
  templateUrl: './uninstall-plugin.component.html',
})
export class UninstallPluginComponent implements OnInit {
  @Input() plugin: any
  @Input() childBridges: any[]
  @Input() action: string

  public loading = true
  public removeConfig = true
  public removeChildBridges = true
  public hasChildBridges = false

  public pluginType: 'platform' | 'accessory'
  public pluginAlias: string

  constructor(
    public $activeModal: NgbActiveModal,
    private $api: ApiService,
    private $modal: NgbModal,
    private $toastr: ToastrService,
    private $translate: TranslateService,
  ) {}

  async ngOnInit() {
    try {
      if (this.childBridges.length) {
        this.hasChildBridges = true
      }

      const schema = await this.getAlias()
      this.pluginType = schema.pluginType
      this.pluginAlias = schema.pluginAlias
    } finally {
      this.loading = false
    }
  }

  async doUninstall() {
    // Remove the plugin config if exists and specified by the user
    if (this.removeConfig && this.pluginType && this.pluginAlias) {
      try {
        await this.removePluginConfig()
      } catch (error) {
        console.error(error)
        this.$toastr.error(this.$translate.instant('plugins.config.remove_error'), this.$translate.instant('toast.title_error'))
      }
    }

    // Remove the child bridges if exists and specified by the user
    if (this.hasChildBridges && this.removeChildBridges) {
      await Promise.all(this.childBridges.map(childBridge => this.unpairChildBridge(childBridge.username.replace(/:/g, ''))))
    }

    // Close the modal
    this.$activeModal.dismiss()

    // Open a new modal to finally uninstall the plugin
    const ref = this.$modal.open(ManagePluginComponent, {
      size: 'lg',
      backdrop: 'static',
    })
    ref.componentInstance.action = 'Uninstall'
    ref.componentInstance.pluginName = this.plugin.name
  }

  async getAlias() {
    return firstValueFrom(this.$api.get(`/plugins/alias/${encodeURIComponent(this.plugin.name)}`))
  }

  async removePluginConfig() {
    // Remove the config for this plugin
    await firstValueFrom(this.$api.post(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}`, []))

    // If the plugin is in the disabled list, then remove it
    await firstValueFrom(this.$api.put(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}/enable`, {}))

    this.$toastr.success(
      this.$translate.instant('plugins.settings.toast_plugin_config_saved'),
      this.$translate.instant('toast.title_success'),
    )
  }

  async unpairChildBridge(id: string) {
    try {
      await firstValueFrom(this.$api.delete(`/server/pairings/${id}`))
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('plugins.uninstall_bridge_error'), this.$translate.instant('toast.title_error'))
    }
  }
}
