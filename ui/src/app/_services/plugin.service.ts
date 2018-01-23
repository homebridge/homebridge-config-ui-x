import { Injectable } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { PluginsManageComponent } from '../plugins/plugins.manage.component';

@Injectable()
export class PluginService {

  constructor(private modalService: NgbModal) {
  }

  installPlugin(pluginName) {
    const ref = this.modalService.open(PluginsManageComponent, {
      size: 'lg',
    });
    ref.componentInstance.action = 'Install';
    ref.componentInstance.pluginName = pluginName;
  }

  uninstallPlugin(pluginName) {
    const ref = this.modalService.open(PluginsManageComponent, {
      size: 'lg',
    });
    ref.componentInstance.action = 'Uninstall';
    ref.componentInstance.pluginName = pluginName;
  }

  updatePlugin(pluginName) {
    const ref = this.modalService.open(PluginsManageComponent, {
      size: 'lg',
    });
    ref.componentInstance.action = 'Update';
    ref.componentInstance.pluginName = pluginName;
  }

  upgradeHomebridge() {
    const ref = this.modalService.open(PluginsManageComponent, {
      size: 'lg',
    });
    ref.componentInstance.action = 'Upgrade';
    ref.componentInstance.pluginName = 'Homebridge';
  }

}
