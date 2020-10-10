import { Injectable } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { minVersion, gte } from 'semver';

import { AuthService } from '../auth/auth.service';
import { CustomPluginsService } from './custom-plugins/custom-plugins.service';
import { ManagePluginsModalComponent } from './manage-plugins-modal/manage-plugins-modal.component';
import { UninstallPluginsModalComponent } from './uninstall-plugins-modal/uninstall-plugins-modal.component';
import { SettingsPluginsModalComponent } from './settings-plugins-modal/settings-plugins-modal.component';
import { NodeUpdateRequiredModalComponent } from './node-update-required-modal/node-update-required-modal.component';
import { ManualPluginConfigModalComponent } from './manual-plugin-config-modal/manual-plugin-config-modal.component';

@Injectable({
  providedIn: 'root',
})
export class ManagePluginsService {

  constructor(
    private modalService: NgbModal,
    private customPluginsService: CustomPluginsService,
    private $auth: AuthService,
  ) { }

  installPlugin(pluginName) {
    const ref = this.modalService.open(ManagePluginsModalComponent, {
      size: 'lg',
      backdrop: 'static',
    });
    ref.componentInstance.action = 'Install';
    ref.componentInstance.pluginName = pluginName;
  }

  uninstallPlugin(plugin) {
    const ref = this.modalService.open(UninstallPluginsModalComponent, {
      backdrop: 'static',
    });
    ref.componentInstance.action = 'Uninstall';
    ref.componentInstance.plugin = plugin;
  }

  async updatePlugin(plugin) {
    if (!await this.checkNodeVersion(plugin)) {
      return;
    }

    const ref = this.modalService.open(ManagePluginsModalComponent, {
      size: 'lg',
      backdrop: 'static',
    });
    ref.componentInstance.action = 'Update';
    ref.componentInstance.pluginName = plugin.name;
  }

  async upgradeHomebridge(homebridgePkg) {
    if (!await this.checkNodeVersion(homebridgePkg)) {
      return;
    }

    const ref = this.modalService.open(ManagePluginsModalComponent, {
      size: 'lg',
      backdrop: 'static',
    });
    ref.componentInstance.action = 'Update';
    ref.componentInstance.pluginName = homebridgePkg.name;
  }

  /**
   * Open the plugin settings modal
   * @param pluginName
   */
  settings(plugin) {
    if (this.customPluginsService.plugins[plugin.name]) {
      return this.customPluginsService.openSettings(plugin.name);
    }

    const ref = this.modalService.open(
      plugin.settingsSchema ? SettingsPluginsModalComponent : ManualPluginConfigModalComponent,
      {
        size: 'lg',
        backdrop: 'static',
      },
    );

    ref.componentInstance.pluginName = plugin.name;
    ref.componentInstance.plugin = plugin;

    return ref.result;
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
