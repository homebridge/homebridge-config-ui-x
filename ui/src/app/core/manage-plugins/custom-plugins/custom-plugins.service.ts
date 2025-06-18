import { inject, Injectable } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { firstValueFrom } from 'rxjs'

import { ApiService } from '@/app/core/api.service'
import { CustomPluginsComponent } from '@/app/core/manage-plugins/custom-plugins/custom-plugins.component'

@Injectable({
  providedIn: 'root',
})
export class CustomPluginsService {
  private $api = inject(ApiService)
  private $modal = inject(NgbModal)

  public plugins = {
  }

  constructor() { }

  async openSettings(plugin: any, schema: any) {
    const pluginConfig = await this.loadPluginConfig(plugin.name)
    const ref = this.$modal.open(this.plugins[plugin.name], {
      size: 'lg',
      backdrop: 'static',
    })
    ref.componentInstance.plugin = plugin
    ref.componentInstance.schema = schema
    ref.componentInstance.pluginConfig = pluginConfig

    return ref.result.catch(() => { /* do nothing */ })
  }

  async openCustomSettingsUi(plugin: any, schema: any) {
    const pluginConfig = await this.loadPluginConfig(plugin.name)
    const ref = this.$modal.open(CustomPluginsComponent, {
      size: 'lg',
      backdrop: 'static',
    })

    ref.componentInstance.plugin = plugin
    ref.componentInstance.schema = schema
    ref.componentInstance.pluginConfig = pluginConfig

    return ref.result.catch(() => { /* do nothing */ })
  }

  private async loadPluginConfig(pluginName: string) {
    return firstValueFrom(this.$api.get(`/config-editor/plugin/${encodeURIComponent(pluginName)}`))
  }
}
