import { Injectable } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { gte, minVersion } from 'semver';
import { BridgePluginsModalComponent } from './bridge-plugins-modal/bridge-plugins-modal.component';
import { CustomPluginsService } from './custom-plugins/custom-plugins.service';
import { ManagePluginsModalComponent } from './manage-plugins-modal/manage-plugins-modal.component';
import { ManualPluginConfigModalComponent } from './manual-plugin-config-modal/manual-plugin-config-modal.component';
import { NodeUpdateRequiredModalComponent } from './node-update-required-modal/node-update-required-modal.component';
import { SelectPreviousVersionComponent } from './select-previous-version/select-previous-version.component';
import { SettingsPluginsModalComponent } from './settings-plugins-modal/settings-plugins-modal.component';
import { UninstallPluginsModalComponent } from './uninstall-plugins-modal/uninstall-plugins-modal.component';
import { ApiService } from '@/app/core/api.service';
import { SettingsService } from '@/app/core/settings.service';

@Injectable({
  providedIn: 'root',
})
export class ManagePluginsService {

  constructor(
    private modalService: NgbModal,
    private customPluginsService: CustomPluginsService,
    private $settings: SettingsService,
    private $api: ApiService,
    private $toastr: ToastrService,
  ) { }

  installPlugin(pluginName: string, targetVersion = 'latest') {
    const ref = this.modalService.open(ManagePluginsModalComponent, {
      size: 'lg',
      backdrop: 'static',
      keyboard: false,
    });
    ref.componentInstance.action = 'Install';
    ref.componentInstance.pluginName = pluginName;
    ref.componentInstance.targetVersion = targetVersion;
  }

  uninstallPlugin(plugin: any) {
    const ref = this.modalService.open(UninstallPluginsModalComponent, {
      backdrop: 'static',
      keyboard: false,
    });
    ref.componentInstance.action = 'Uninstall';
    ref.componentInstance.plugin = plugin;
  }

  async updatePlugin(plugin: any, targetVersion = 'latest') {
    if (!await this.checkNodeVersion(plugin)) {
      return;
    }

    const ref = this.modalService.open(ManagePluginsModalComponent, {
      size: 'lg',
      backdrop: 'static',
      keyboard: false,
    });
    ref.componentInstance.action = 'Update';
    ref.componentInstance.pluginName = plugin.name;
    ref.componentInstance.targetVersion = targetVersion;
  }

  async upgradeHomebridge(homebridgePkg: any, targetVersion = 'latest') {
    if (!await this.checkNodeVersion(homebridgePkg)) {
      return;
    }

    const ref = this.modalService.open(ManagePluginsModalComponent, {
      size: 'lg',
      backdrop: 'static',
      keyboard: false,
    });
    ref.componentInstance.action = 'Update';
    ref.componentInstance.pluginName = homebridgePkg.name;
    ref.componentInstance.targetVersion = targetVersion;
  }

  /**
   * Open the version selector
   *
   * @param plugin
   */
  async installPreviousVersion(plugin: any) {
    const ref = this.modalService.open(SelectPreviousVersionComponent, {
      backdrop: 'static',
    });

    ref.componentInstance.plugin = plugin;

    try {
      const targetVersion = await ref.result;
      return plugin.installedVersion && plugin.name !== 'homebridge' ?
        this.updatePlugin(plugin, targetVersion) :
        this.installPlugin(plugin.name, targetVersion);
    } catch (e) {
      // do nothing
    }
  }

  /**
   * Open the child bridge modal
   *
   * @param plugin
   */
  async bridgeSettings(plugin: any) {
    // load the plugins schema
    let schema: any;
    if (plugin.settingsSchema) {
      try {
        schema = await this.loadConfigSchema(plugin.name);
      } catch (e) {
        this.$toastr.error('Failed to load plugins config schema.');
        return;
      }
    }

    const ref = this.modalService.open(BridgePluginsModalComponent, {
      size: 'lg',
      backdrop: 'static',
    });

    ref.componentInstance.schema = schema;
    ref.componentInstance.plugin = plugin;
  }

  /**
   * Open the plugin settings modal
   *
   * @param plugin
   */
  async settings(plugin: any) {
    // load the plugins schema
    let schema: any;
    if (plugin.settingsSchema) {
      try {
        schema = await this.loadConfigSchema(plugin.name);
      } catch (e) {
        this.$toastr.error('Failed to load plugins config schema.');
        return;
      }
    }

    // open the custom ui if the plugin has one
    if (schema && schema.customUi) {
      return this.customPluginsService.openCustomSettingsUi(plugin, schema);
    }

    if (this.customPluginsService.plugins[plugin.name]) {
      return this.customPluginsService.openSettings(plugin, schema);
    }

    // open the standard ui
    const ref = this.modalService.open(
      plugin.settingsSchema ? SettingsPluginsModalComponent : ManualPluginConfigModalComponent,
      {
        size: 'lg',
        backdrop: 'static',
      },
    );

    ref.componentInstance.schema = schema;
    ref.componentInstance.plugin = plugin;

    return ref.result.catch(() => {
      // do nothing
    });
  }

  /**
   * Open the json config modal
   */
  async jsonEditor(plugin: any) {
    const ref = this.modalService.open(
      ManualPluginConfigModalComponent,
      {
        size: 'lg',
        backdrop: 'static',
      },
    );

    ref.componentInstance.plugin = plugin;

    return ref.result.catch(() => {
      // do nothing
    });
  }

  private async loadConfigSchema(pluginName: string) {
    return this.$api.get(`/plugins/config-schema/${encodeURIComponent(pluginName)}`).toPromise();
  }

  private async checkNodeVersion(plugin: any): Promise<boolean> {
    if (plugin.engines && plugin.engines.node) {
      if (gte(this.$settings.env.nodeVersion, minVersion(plugin.engines.node))) {
        return true;
      }

      try {
        // open modal warning about Node.js version
        const ref = this.modalService.open(NodeUpdateRequiredModalComponent, {
          backdrop: 'static',
        });
        ref.componentInstance.plugin = plugin;

        return await ref.result;
      } catch (e) {
        return false;
      }
    } else {
      return true;
    }
  }

}
