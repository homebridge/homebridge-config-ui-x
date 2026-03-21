import { createEnvironmentInjector, EnvironmentInjector, inject, Injectable } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'

import { ApiService } from '@/app/core/communication/api.service'
import { CUSTOM_PLUGINS_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { CustomPluginsComponent } from '@/app/core/plugins/custom-plugins/custom-plugins.component'
import { Plugin } from '@/app/core/plugins/manage-plugins.interfaces'

@Injectable({
  providedIn: 'root',
})
export class CustomPluginsService {
  private injector = inject(EnvironmentInjector)
  private $api = inject(ApiService)
  private $modal = inject(NgbModal)

  public plugins = {}

  async openSettings(plugin: Plugin, schema: any) {
    const pluginConfig = await this.loadPluginConfig(plugin.name)

    const injector = createEnvironmentInjector([{
      provide: CUSTOM_PLUGINS_MODAL_DATA,
      useValue: {
        plugin,
        schema,
        pluginConfig,
      },
    }], this.injector)

    const ref = this.$modal.open(this.plugins[plugin.name], {
      size: 'lg',
      backdrop: 'static',
      injector,
    })

    return ref.result.catch(() => { /* modal dismissed */ })
  }

  async openCustomSettingsUi(plugin: Plugin, schema: any) {
    const pluginConfig = await this.loadPluginConfig(plugin.name)

    const injector = createEnvironmentInjector([{
      provide: CUSTOM_PLUGINS_MODAL_DATA,
      useValue: {
        plugin,
        schema,
        pluginConfig,
      },
    }], this.injector)

    const ref = this.$modal.open(CustomPluginsComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })

    return ref.result.catch(() => { /* modal dismissed */ })
  }

  private async loadPluginConfig(pluginName: string) {
    return this.$api.get(`/config-editor/plugin/${encodeURIComponent(pluginName)}`)
  }
}
