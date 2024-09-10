import { CustomPluginsComponent } from '@/app/core/manage-plugins/custom-plugins/custom-plugins.component'
import { HomebridgeGoogleSmarthomeComponent } from '@/app/core/manage-plugins/custom-plugins/homebridge-google-smarthome/homebridge-google-smarthome.component'
import { Injectable } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'

import { ApiService } from '../../api.service'

@Injectable({
  providedIn: 'root',
})
export class CustomPluginsService {
  public plugins = {
    'homebridge-gsh': HomebridgeGoogleSmarthomeComponent,
  }

  constructor(
    private modalService: NgbModal,
    private $api: ApiService,
  ) {}

  async openSettings(plugin, schema) {
    const pluginConfig = await this.loadPluginConfig(plugin.name)
    const ref = this.modalService.open(this.plugins[plugin.name], {
      size: 'lg',
      backdrop: 'static',
    })
    ref.componentInstance.plugin = plugin
    ref.componentInstance.schema = schema
    ref.componentInstance.pluginConfig = pluginConfig

    return ref.result.catch(() => {
      // do nothing
    })
  }

  async openCustomSettingsUi(plugin, schema) {
    const pluginConfig = await this.loadPluginConfig(plugin.name)
    const ref = this.modalService.open(CustomPluginsComponent, {
      size: 'lg',
      backdrop: 'static',
    })

    ref.componentInstance.plugin = plugin
    ref.componentInstance.schema = schema
    ref.componentInstance.pluginConfig = pluginConfig

    return ref.result.catch(() => {
      // do nothing
    })
  }

  private async loadPluginConfig(pluginName: string) {
    return this.$api.get(`/config-editor/plugin/${encodeURIComponent(pluginName)}`).toPromise()
  }
}
