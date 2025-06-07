import { Component, inject, Input, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal, NgbAlert, NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

import { ApiService } from '@/app/core/api.service'
import { ManagePluginComponent } from '@/app/core/manage-plugins/manage-plugin/manage-plugin.component'
import { SettingsService } from '@/app/core/settings.service'

@Component({
  templateUrl: './uninstall-plugin.component.html',
  standalone: true,
  imports: [
    FormsModule,
    NgbAlert,
    TranslatePipe,
  ],
})
export class UninstallPluginComponent implements OnInit {
  $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $modal = inject(NgbModal)
  $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  @Input() plugin: any
  @Input() childBridges: any[]
  @Input() action: string

  public loading = true
  public uninstalling = false
  public removeConfig = true
  public removeChildBridges = true
  public hasChildBridges = false
  public isConfigured = false

  public pluginType: 'platform' | 'accessory'
  public pluginAlias: string

  constructor() {}

  async ngOnInit() {
    try {
      if (this.childBridges.length) {
        this.hasChildBridges = true
      }

      const schema = await this.getAlias()
      this.pluginType = schema.pluginType
      this.pluginAlias = schema.pluginAlias

      const existingConfig = await firstValueFrom(this.$api.get(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}`))
      if (existingConfig.length) {
        this.isConfigured = true
      }
    } finally {
      this.loading = false
    }
  }

  async doUninstall() {
    this.uninstalling = true

    // Remove the plugin config if exists and specified by the user
    if (this.removeConfig && this.isConfigured) {
      try {
        await this.removePluginConfig()
      } catch (error) {
        console.error(error)
        this.$toastr.error(this.$translate.instant('plugins.config.remove_error'), this.$translate.instant('toast.title_error'))
      }
    }

    // Remove the child bridges if exists and specified by the user
    if (this.hasChildBridges && this.removeChildBridges && this.$settings.env.serviceMode) {
      try {
        await Promise.all(this.childBridges.map(childBridge => this.removeChildBridge(childBridge.username.replace(/:/g, ''))))
      } catch (error) {
        console.error(error)
      }
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
    ref.componentInstance.pluginDisplayName = this.plugin.displayName
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
      this.$translate.instant('plugins.settings.plugin_config_saved'),
      this.$translate.instant('toast.title_success'),
    )
  }

  async removeChildBridge(id: string) {
    try {
      await firstValueFrom(this.$api.delete(`/server/pairings/${id}`))
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('plugins.uninstall_bridge_error'), this.$translate.instant('toast.title_error'))
    }
  }
}
