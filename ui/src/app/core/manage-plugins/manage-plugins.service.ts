import { ApiService } from '@/app/core/api.service'
import { CustomPluginsService } from '@/app/core/manage-plugins/custom-plugins/custom-plugins.service'
import { ManagePluginComponent } from '@/app/core/manage-plugins/manage-plugin/manage-plugin.component'
import { ManageVersionComponent } from '@/app/core/manage-plugins/manage-version/manage-version.component'
import { ManualConfigComponent } from '@/app/core/manage-plugins/manual-config/manual-config.component'
import { PluginBridgeComponent } from '@/app/core/manage-plugins/plugin-bridge/plugin-bridge.component'
import { PluginCompatibilityComponent } from '@/app/core/manage-plugins/plugin-compatibility/plugin-compatibility.component'
import { PluginConfigComponent } from '@/app/core/manage-plugins/plugin-config/plugin-config.component'
import { ResetAccessoriesComponent } from '@/app/core/manage-plugins/reset-accessories/reset-accessories.component'
import { UninstallPluginComponent } from '@/app/core/manage-plugins/uninstall-plugin/uninstall-plugin.component'
import { SettingsService } from '@/app/core/settings.service'
import { Injectable } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'
import { lt, minVersion } from 'semver'

@Injectable({
  providedIn: 'root',
})
export class ManagePluginsService {
  constructor(
    private $api: ApiService,
    private $modal: NgbModal,
    private $customPluginsService: CustomPluginsService,
    private $settings: SettingsService,
    private $toastr: ToastrService,
    private $translate: TranslateService,
  ) {}

  installPlugin(pluginName: string, targetVersion = 'latest') {
    const ref = this.$modal.open(ManagePluginComponent, {
      size: 'lg',
      backdrop: 'static',
    })
    ref.componentInstance.action = 'Install'
    ref.componentInstance.pluginName = pluginName
    ref.componentInstance.targetVersion = targetVersion
  }

  uninstallPlugin(plugin: any, childBridges: any[]) {
    const ref = this.$modal.open(UninstallPluginComponent, {
      size: 'lg',
      backdrop: 'static',
    })
    ref.componentInstance.action = 'Uninstall'
    ref.componentInstance.plugin = plugin
    ref.componentInstance.childBridges = childBridges
  }

  async checkAndUpdatePlugin(plugin: any, targetVersion = 'latest') {
    if (!await this.checkHbAndNodeVersion(plugin, 'update')) {
      return
    }

    await this.updatePlugin(plugin, targetVersion)
  }

  async updatePlugin(plugin: any, targetVersion: string) {
    const ref = this.$modal.open(ManagePluginComponent, {
      size: 'lg',
      backdrop: 'static',
    })
    ref.componentInstance.action = 'Update'
    ref.componentInstance.pluginName = plugin.name
    ref.componentInstance.targetVersion = targetVersion
    ref.componentInstance.latestVersion = plugin.latestVersion
    ref.componentInstance.installedVersion = plugin.installedVersion
    ref.componentInstance.isDisabled = plugin.disabled
  }

  async upgradeHomebridge(homebridgePkg: any, targetVersion = 'latest') {
    if (!await this.checkHbAndNodeVersion(homebridgePkg, 'update')) {
      return
    }

    const ref = this.$modal.open(ManagePluginComponent, {
      size: 'lg',
      backdrop: 'static',
    })
    ref.componentInstance.action = 'Update'
    ref.componentInstance.pluginName = homebridgePkg.name
    ref.componentInstance.targetVersion = targetVersion
    ref.componentInstance.latestVersion = homebridgePkg.latestVersion
    ref.componentInstance.installedVersion = homebridgePkg.installedVersion
  }

  /**
   * Open the version selector
   *
   * @param plugin
   */
  async installAlternateVersion(plugin: any) {
    const ref = this.$modal.open(ManageVersionComponent, {
      size: 'lg',
      backdrop: 'static',
    })

    ref.componentInstance.plugin = plugin

    try {
      const { action, version, engines } = await ref.result

      if (!await this.checkHbAndNodeVersion({ ...plugin, updateEngines: engines }, action)) {
        return
      }

      if (plugin.name === 'homebridge') {
        return await this.upgradeHomebridge(plugin, version)
      }

      return plugin.installedVersion
        ? await this.updatePlugin(plugin, version)
        : this.installPlugin(plugin.name, version)
    } catch (e) {
      // do nothing
    }
  }

  /**
   * Open the child bridge modal
   * @param plugin
   * @param justInstalled
   */
  async bridgeSettings(plugin: any, justInstalled = false) {
    // load the plugins schema
    let schema: any
    if (plugin.settingsSchema) {
      try {
        schema = await this.loadConfigSchema(plugin.name)
      } catch (error) {
        console.error(error)
        this.$toastr.error(this.$translate.instant('plugins.toast_failed_to_load_plugin_schema'), this.$translate.instant('toast.title_error'))
        return
      }
    }

    const ref = this.$modal.open(PluginBridgeComponent, {
      size: 'lg',
      backdrop: 'static',
    })

    ref.componentInstance.schema = schema
    ref.componentInstance.plugin = plugin
    ref.componentInstance.justInstalled = justInstalled
  }

  /**
   * Open the plugin settings modal
   *
   * @param plugin
   */
  async settings(plugin: any) {
    // load the plugins schema
    let schema: any
    if (plugin.settingsSchema) {
      try {
        schema = await this.loadConfigSchema(plugin.name)
      } catch (error) {
        console.error(error)
        this.$toastr.error(this.$translate.instant('plugins.toast_failed_to_load_plugin_schema'), this.$translate.instant('toast.title_error'))
        return
      }
    }

    // open the custom ui if the plugin has one
    if (schema && schema.customUi) {
      return this.$customPluginsService.openCustomSettingsUi(plugin, schema)
    }

    if (this.$customPluginsService.plugins[plugin.name]) {
      return this.$customPluginsService.openSettings(plugin, schema)
    }

    // open the standard ui
    const ref = this.$modal.open(
      plugin.settingsSchema ? PluginConfigComponent : ManualConfigComponent,
      {
        size: 'lg',
        backdrop: 'static',
      },
    )

    ref.componentInstance.schema = schema
    ref.componentInstance.plugin = plugin

    return ref.result.catch(() => {
      // do nothing
    })
  }

  /**
   * Open the json config modal
   */
  async jsonEditor(plugin: any) {
    const ref = this.$modal.open(ManualConfigComponent, {
      size: 'lg',
      backdrop: 'static',
    })

    ref.componentInstance.plugin = plugin

    return ref.result.catch(error => console.error(error))
  }

  async checkHbAndNodeVersion(plugin: any, action: string): Promise<boolean> {
    let isValidNode = true
    let isValidHb = true

    try {
      // Check Node.js version from the `package.engines` of the plugin being installed/updated
      if (plugin.updateEngines?.node && lt(this.$settings.env.nodeVersion, minVersion(plugin.updateEngines.node))) {
        isValidNode = false
      }

      // Check Homebridge version from the `package.engines` of the plugin being installed/updated
      if (plugin.updateEngines?.homebridge && lt(this.$settings.env.homebridgeVersion, minVersion(plugin.updateEngines.homebridge))) {
        isValidHb = false
      }
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      return false
    }

    // If either are false, open modal warning about compatibility
    if (!isValidNode || !isValidHb) {
      try {
        const ref = this.$modal.open(PluginCompatibilityComponent, {
          size: 'lg',
          backdrop: 'static',
        })
        ref.componentInstance.plugin = plugin
        ref.componentInstance.isValidNode = isValidNode
        ref.componentInstance.isValidHb = isValidHb
        ref.componentInstance.action = action

        return await ref.result
      } catch (e) {
        return false
      }
    }

    return true
  }

  private async loadConfigSchema(pluginName: string) {
    return firstValueFrom(this.$api.get(`/plugins/config-schema/${encodeURIComponent(pluginName)}`))
  }

  /**
   * Open the reset child bridges modal
   */
  async resetChildBridges(childBridges: any[]) {
    const ref = this.$modal.open(ResetAccessoriesComponent, {
      size: 'lg',
      backdrop: 'static',
    })

    ref.componentInstance.childBridges = childBridges
  }
}
