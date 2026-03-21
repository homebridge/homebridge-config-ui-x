import { createEnvironmentInjector, EnvironmentInjector, inject, Injectable } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { Subject } from 'rxjs'
import { lt, minVersion } from 'semver'

import { ApiService } from '@/app/core/communication/api.service'
import { RestartHomebridgeComponent } from '@/app/core/components/restart-homebridge/restart-homebridge.component'
import {
  MANAGE_PLUGIN_MODAL_DATA,
  MANAGE_VERSION_MODAL_DATA,
  PLUGIN_BRIDGE_MODAL_DATA,
  PLUGIN_COMPATIBILITY_MODAL_DATA,
  PLUGIN_MODAL_DATA,
  RESET_ACCESSORIES_MODAL_DATA,
  SWITCH_TO_SCOPED_MODAL_DATA,
  UNINSTALL_PLUGIN_MODAL_DATA,
} from '@/app/core/modal-data-tokens'
import { CustomPluginsService } from '@/app/core/plugins/custom-plugins/custom-plugins.service'
import { ManagePluginComponent } from '@/app/core/plugins/manage-plugin/manage-plugin.component'
import { ChildBridge, Plugin } from '@/app/core/plugins/manage-plugins.interfaces'
import { ManageVersionComponent } from '@/app/core/plugins/manage-version/manage-version.component'
import { ManualConfigComponent } from '@/app/core/plugins/manual-config/manual-config.component'
import { PluginBridgeComponent } from '@/app/core/plugins/plugin-bridge/plugin-bridge.component'
import { PluginCompatibilityComponent } from '@/app/core/plugins/plugin-compatibility/plugin-compatibility.component'
import { PluginConfigComponent } from '@/app/core/plugins/plugin-config/plugin-config.component'
import { ResetAccessoriesComponent } from '@/app/core/plugins/reset-accessories/reset-accessories.component'
import { SwitchToScopedComponent } from '@/app/core/plugins/switch-to-scoped/switch-to-scoped.component'
import { UninstallPluginComponent } from '@/app/core/plugins/uninstall-plugin/uninstall-plugin.component'
import { SettingsService } from '@/app/core/ui/settings.service'

@Injectable({
  providedIn: 'root',
})
export class ManagePluginsService {
  private $api = inject(ApiService)
  private $modal = inject(NgbModal)
  private $customPluginsService = inject(CustomPluginsService)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private injector = inject(EnvironmentInjector)

  // Subject to notify when plugins list needs to be refreshed
  private pluginListRefreshSubject = new Subject<void>()
  public onPluginListRefresh = this.pluginListRefreshSubject.asObservable()

  async installPlugin(plugin: Plugin, targetVersion: string, backToVersionModal: Plugin = null) {
    const injector = createEnvironmentInjector([{
      provide: MANAGE_PLUGIN_MODAL_DATA,
      useValue: {
        action: 'Install',
        pluginName: plugin.name,
        pluginDisplayName: plugin.displayName,
        targetVersion,
        isConfigured: plugin.isConfigured,
        onRefreshPluginList: () => this.pluginListRefreshSubject.next(),
        verifiedPlugin: plugin.verifiedPlugin,
        verifiedPlusPlugin: plugin.verifiedPlusPlugin,
        funding: plugin.funding,
        backToVersionModal,
      },
    }], this.injector)

    const ref = this.$modal.open(ManagePluginComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })

    try {
      const result = await ref.result

      // Handle just-installed action
      if (result?.action === 'just-installed' && result?.plugin) {
        if (result.plugin.isConfigured) {
          this.$modal.open(RestartHomebridgeComponent, {
            size: 'lg',
            backdrop: 'static',
          })
        } else {
          await this.settings(result.plugin)
        }
      }
    } catch (e) {
      // Modal was dismissed
    }
  }

  async uninstallPlugin(plugin: Plugin, childBridges: ChildBridge[]) {
    const injector = createEnvironmentInjector([{
      provide: UNINSTALL_PLUGIN_MODAL_DATA,
      useValue: {
        plugin,
        childBridges,
        action: 'Uninstall',
        keepOrphans: this.$settings.keepOrphans,
        onRefreshPluginList: () => this.pluginListRefreshSubject.next(),
      },
    }], this.injector)

    const ref = this.$modal.open(UninstallPluginComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })

    try {
      await ref.result
      // Refresh the plugin list after uninstall completes
      this.pluginListRefreshSubject.next()
    } catch (e) {
      // Modal was dismissed without uninstalling
    }
  }

  async checkAndUpdatePlugin(plugin: Plugin, targetVersion: string) {
    if (!await this.checkHbAndNodeVersion(plugin, 'update')) {
      return
    }

    await this.updatePlugin(plugin, targetVersion)
  }

  async updatePlugin(plugin: Plugin, targetVersion: string, backToVersionModal: Plugin = null) {
    const injector = createEnvironmentInjector([{
      provide: MANAGE_PLUGIN_MODAL_DATA,
      useValue: {
        action: 'Update',
        pluginName: plugin.name,
        pluginDisplayName: plugin.displayName,
        targetVersion,
        latestVersion: plugin.latestVersion,
        installedVersion: plugin.installedVersion,
        isDisabled: plugin.disabled,
        isConfigured: plugin.isConfigured,
        onRefreshPluginList: () => this.pluginListRefreshSubject.next(),
        verifiedPlugin: plugin.verifiedPlugin,
        verifiedPlusPlugin: plugin.verifiedPlusPlugin,
        funding: plugin.funding,
        backToVersionModal,
      },
    }], this.injector)

    const ref = this.$modal.open(ManagePluginComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })

    try {
      const result = await ref.result

      // Handle just-installed action (also triggered for updates)
      if (result?.action === 'just-installed' && result?.plugin) {
        if (result.plugin.isConfigured) {
          this.$modal.open(RestartHomebridgeComponent, {
            size: 'lg',
            backdrop: 'static',
          })
        } else {
          await this.settings(result.plugin)
        }
      }
    } catch (e) {
      // Modal was dismissed
    }
  }

  async upgradeHomebridge(homebridgePkg: Plugin, targetVersion: string) {
    if (!await this.checkHbAndNodeVersion(homebridgePkg, 'update')) {
      return
    }

    const injector = createEnvironmentInjector([{
      provide: MANAGE_PLUGIN_MODAL_DATA,
      useValue: {
        action: 'Update',
        pluginName: homebridgePkg.name,
        pluginDisplayName: homebridgePkg.displayName,
        targetVersion,
        latestVersion: homebridgePkg.latestVersion,
        installedVersion: homebridgePkg.installedVersion,
      },
    }], this.injector)

    this.$modal.open(ManagePluginComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })
  }

  /**
   * Open the version selector
   * @param plugin
   * @param onSettingsChange
   */
  async installAlternateVersion(plugin: Plugin, onSettingsChange?: () => void) {
    const injector = createEnvironmentInjector([{
      provide: MANAGE_VERSION_MODAL_DATA,
      useValue: {
        plugin,
        onRefreshPluginList: () => this.pluginListRefreshSubject.next(),
        onSettingsChange,
      },
    }], this.injector)

    const ref = this.$modal.open(ManageVersionComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })

    try {
      const { action, version, engines } = await ref.result

      if (!await this.checkHbAndNodeVersion({ ...plugin, updateEngines: engines }, action)) {
        return
      }

      if (plugin.name === 'homebridge') {
        return await this.upgradeHomebridge(plugin, version)
      }

      return plugin.installedVersion
        ? await this.updatePlugin(plugin, version, plugin)
        : this.installPlugin(plugin, version, plugin)
    } catch (e) {
      // Do nothing
    }
  }

  /**
   * Open the child bridge modal
   * @param plugin
   * @param justInstalled
   */
  async bridgeSettings(plugin: Plugin, justInstalled = false) {
    // Load the plugins schema
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

    const injector = createEnvironmentInjector([{
      provide: PLUGIN_BRIDGE_MODAL_DATA,
      useValue: {
        schema,
        plugin,
        justInstalled,
      },
    }], this.injector)

    const ref = this.$modal.open(PluginBridgeComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })

    try {
      const result = await ref.result

      // If the modal closed with 'refresh' result, emit refresh event
      if (result === 'refresh') {
        this.pluginListRefreshSubject.next()
      }
    } catch (error) { /* modal was dismissed */ }
  }

  /**
   * Open the plugin settings modal
   * @param plugin
   */
  async settings(plugin: Plugin) {
    // Load the plugins schema
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

    // Open the custom ui if the plugin has one
    if (schema && schema.customUi) {
      return this.$customPluginsService.openCustomSettingsUi(plugin, schema)
    }

    if (this.$customPluginsService.plugins[plugin.name]) {
      return this.$customPluginsService.openSettings(plugin, schema)
    }

    // Open the standard ui
    const injector = createEnvironmentInjector([{
      provide: PLUGIN_MODAL_DATA,
      useValue: {
        schema,
        plugin,
      },
    }], this.injector)

    const ref = this.$modal.open(
      plugin.settingsSchema ? PluginConfigComponent : ManualConfigComponent,
      {
        size: 'lg',
        backdrop: 'static',
        injector,
      },
    )

    return ref.result.catch(() => { /* modal dismissed */ })
  }

  /**
   * Open the JSON config modal
   */
  async jsonEditor(plugin: Plugin) {
    // Load the plugins schema
    let schema: any
    if (plugin.settingsSchema) {
      try {
        schema = await this.loadConfigSchema(plugin.name)
      } catch (error) {
        console.error(error)
      }
    }

    const injector = createEnvironmentInjector([{
      provide: PLUGIN_MODAL_DATA,
      useValue: {
        schema,
        plugin,
      },
    }], this.injector)

    const ref = this.$modal.open(ManualConfigComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })

    return ref.result.catch(error => console.error(error))
  }

  async checkHbAndNodeVersion(plugin: Plugin, action: string): Promise<boolean> {
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
        const injector = createEnvironmentInjector([{
          provide: PLUGIN_COMPATIBILITY_MODAL_DATA,
          useValue: {
            plugin,
            isValidNode,
            isValidHb,
            action,
          },
        }], this.injector)

        const ref = this.$modal.open(PluginCompatibilityComponent, {
          size: 'lg',
          backdrop: 'static',
          injector,
        })

        return await ref.result
      } catch (e) {
        return false
      }
    }

    return true
  }

  private async loadConfigSchema(pluginName: string) {
    return this.$api.get(`/plugins/config-schema/${encodeURIComponent(pluginName)}`)
  }

  /**
   * Open the reset child bridges modal
   */
  async resetChildBridges(childBridges: ChildBridge[]) {
    const injector = createEnvironmentInjector([{
      provide: RESET_ACCESSORIES_MODAL_DATA,
      useValue: {
        childBridges,
      },
    }], this.injector)

    this.$modal.open(ResetAccessoriesComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })
  }

  async switchToScoped(plugin: Plugin) {
    const injector = createEnvironmentInjector([{
      provide: SWITCH_TO_SCOPED_MODAL_DATA,
      useValue: {
        plugin,
      },
    }], this.injector)

    this.$modal.open(SwitchToScopedComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })
  }
}
