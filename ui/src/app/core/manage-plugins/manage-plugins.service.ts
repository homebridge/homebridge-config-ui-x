import { Injectable } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { minVersion, gte } from 'semver';
import { ToastrService } from 'ngx-toastr';

import { AuthService } from '../auth/auth.service';
import { ApiService } from '../api.service';
import { CustomPluginsService } from './custom-plugins/custom-plugins.service';
import { ManagePluginsModalComponent } from './manage-plugins-modal/manage-plugins-modal.component';
import { UninstallPluginsModalComponent } from './uninstall-plugins-modal/uninstall-plugins-modal.component';
import { SettingsPluginsModalComponent } from './settings-plugins-modal/settings-plugins-modal.component';
import { NodeUpdateRequiredModalComponent } from './node-update-required-modal/node-update-required-modal.component';
import { ManualPluginConfigModalComponent } from './manual-plugin-config-modal/manual-plugin-config-modal.component';
import { SelectPreviousVersionComponent } from './select-previous-version/select-previous-version.component';
import { BridgePluginsModalComponent } from './bridge-plugins-modal/bridge-plugins-modal.component';

@Injectable({
  providedIn: 'root',
})
export class ManagePluginsService {

  constructor(
    private modalService: NgbModal,
    private customPluginsService: CustomPluginsService,
    private $auth: AuthService,
    private $api: ApiService,
    private $toastr: ToastrService,
  ) { }

  installPlugin(pluginName, targetVersion = 'latest') {
    const ref = this.modalService.open(ManagePluginsModalComponent, {
      size: 'lg',
      backdrop: 'static',
    });
    ref.componentInstance.action = 'Install';
    ref.componentInstance.pluginName = pluginName;
    ref.componentInstance.targetVersion = targetVersion;
  }

  uninstallPlugin(plugin) {
    const ref = this.modalService.open(UninstallPluginsModalComponent, {
      backdrop: 'static',
    });
    ref.componentInstance.action = 'Uninstall';
    ref.componentInstance.plugin = plugin;
  }

  async updatePlugin(plugin, targetVersion = 'latest') {
    if (!await this.checkNodeVersion(plugin)) {
      return;
    }

    const ref = this.modalService.open(ManagePluginsModalComponent, {
      size: 'lg',
      backdrop: 'static',
    });
    ref.componentInstance.action = 'Update';
    ref.componentInstance.pluginName = plugin.name;
    ref.componentInstance.targetVersion = targetVersion;
  }

  async upgradeHomebridge(homebridgePkg, targetVersion = 'latest') {
    if (!await this.checkNodeVersion(homebridgePkg)) {
      return;
    }

    const ref = this.modalService.open(ManagePluginsModalComponent, {
      size: 'lg',
      backdrop: 'static',
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
  installPreviousVersion(plugin) {
    const ref = this.modalService.open(SelectPreviousVersionComponent, {
      backdrop: 'static',
    });

    ref.componentInstance.plugin = plugin;

    return ref.result.then((targetVersion) => plugin.installedVersion && plugin.name !== 'homebridge' ?
      this.updatePlugin(plugin, targetVersion) :
      this.installPlugin(plugin.name, targetVersion)).catch(() => {
        // do nothing
      });
  }

  /**
   * Open the version selector
   *
   * @param plugin
   */
  async bridgeSettings(plugin) {
    // load the plugins schema
    let schema;
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
  async settings(plugin) {
    // load the plugins schema
    let schema;
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

  private async loadConfigSchema(pluginName) {
    return this.$api.get(`/plugins/config-schema/${encodeURIComponent(pluginName)}`).toPromise();
  }

  private async checkNodeVersion(plugin): Promise<boolean> {
    if (plugin.engines && plugin.engines.node) {
      if (gte(this.$auth.env.nodeVersion, minVersion(plugin.engines.node), { includePrerelease: true })) {
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
