import { Injectable } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { ApiService } from '../../api.service';
import { HomebridgeGoogleSmarthomeComponent } from './homebridge-google-smarthome/homebridge-google-smarthome.component';
import { HomebridgeHoneywellHomeComponent } from './homebridge-honeywell-home/homebridge-honeywell-home.component';
import { HomebridgeRingComponent } from './homebridge-ring/homebridge-ring.component';
import { HomebridgeNestCamComponent } from './homebridge-nest-cam/homebridge-nest-cam.component';
import { CustomPluginsComponent } from './custom-plugins.component';

@Injectable({
  providedIn: 'root',
})
export class CustomPluginsService {

  public plugins = {
    'homebridge-gsh': HomebridgeGoogleSmarthomeComponent,
    'homebridge-honeywell-home': HomebridgeHoneywellHomeComponent,
    'homebridge-honeywell-home-thermostat': HomebridgeHoneywellHomeComponent,
    'homebridge-honeywell-home-roomsensor-thermostat': HomebridgeHoneywellHomeComponent,
    'homebridge-honeywell-home-roomsensor': HomebridgeHoneywellHomeComponent,
    'homebridge-honeywell-leak': HomebridgeHoneywellHomeComponent,
    'homebridge-ring': HomebridgeRingComponent,
    'homebridge-nest-cam': HomebridgeNestCamComponent,
  };

  constructor(
    private modalService: NgbModal,
    private $api: ApiService,
  ) { }

  async openSettings(plugin, schema) {
    const pluginConfig = await this.loadPluginConfig(plugin.name);
    const ref = this.modalService.open(this.plugins[plugin.name], {
      backdrop: 'static',
      size: 'lg',
    });
    ref.componentInstance.plugin = plugin;
    ref.componentInstance.schema = schema;
    ref.componentInstance.pluginConfig = pluginConfig;

    return ref.result.catch(() => {
      // do nothing
    });
  }

  async openCustomSettingsUi(plugin, schema) {
    const pluginConfig = await this.loadPluginConfig(plugin.name);
    const ref = this.modalService.open(CustomPluginsComponent, {
      backdrop: 'static',
      size: 'lg',
    });

    ref.componentInstance.plugin = plugin;
    ref.componentInstance.schema = schema;
    ref.componentInstance.pluginConfig = pluginConfig;

    return ref.result.catch(() => {
      // do nothing
    });
  }

  private async loadPluginConfig(pluginName: string) {
    return this.$api.get(`/config-editor/plugin/${encodeURIComponent(pluginName)}`).toPromise();
  }
}
