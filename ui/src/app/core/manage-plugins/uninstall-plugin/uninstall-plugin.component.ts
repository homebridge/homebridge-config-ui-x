import { ApiService } from '@/app/core/api.service'
import { ManagePluginComponent } from '@/app/core/manage-plugins/manage-plugin/manage-plugin.component'
import { Component, Input, OnInit } from '@angular/core'
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

@Component({
  templateUrl: './uninstall-plugin.component.html',
})
export class UninstallPluginComponent implements OnInit {
  @Input() plugin: any
  @Input() action: string

  public loading = true
  public removeConfig = true

  public pluginType: 'platform' | 'accessory'
  public pluginAlias: string

  constructor(
    private modalService: NgbModal,
    public activeModal: NgbActiveModal,
    private translate: TranslateService,
    private $toastr: ToastrService,
    private $api: ApiService,
  ) {}

  async ngOnInit() {
    try {
      const schema = await this.getAlias()
      this.pluginType = schema.pluginType
      this.pluginAlias = schema.pluginAlias
    } finally {
      this.loading = false
    }
  }

  async doUninstall() {
    if (this.removeConfig && this.pluginType && this.pluginAlias) {
      try {
        await this.removePluginConfig()
      } catch (e) {
        console.error(e)
        this.$toastr.error('Failed to remove plugin config.', this.translate.instant('toast.title_error'))
      }
    }

    this.activeModal.dismiss()

    const ref = this.modalService.open(ManagePluginComponent, {
      size: 'lg',
      backdrop: 'static',
    })
    ref.componentInstance.action = 'Uninstall'
    ref.componentInstance.pluginName = this.plugin.name
  }

  async getAlias() {
    return this.$api.get(`/plugins/alias/${encodeURIComponent(this.plugin.name)}`).toPromise()
  }

  async removePluginConfig() {
    // Remove the config for this plugin
    await this.$api.post(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}`, []).toPromise()

    // If the plugin is in the disabled list, then remove it
    await this.$api.put(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}/enable`, {}).toPromise()

    this.$toastr.success(
      this.translate.instant('plugins.settings.toast_plugin_config_saved'),
    )
  }
}
