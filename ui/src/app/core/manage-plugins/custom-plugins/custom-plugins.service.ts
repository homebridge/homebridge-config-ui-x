import { Injectable } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { ApiService } from '../../api.service';
import { HomebridgeGoogleSmarthomeComponent } from './homebridge-google-smarthome/homebridge-google-smarthome.component';
import { HomebridgeHoneywellHomeComponent } from './homebridge-honeywell-home/homebridge-honeywell-home.component';
import { HomebridgeRingComponent } from './homebridge-ring/homebridge-ring.component';
import { HomebridgeNestCamComponent } from './homebridge-nest-cam/homebridge-nest-cam.component';

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

  async openSettings(pluginName: string) {
    const schema = await this.loadConfigSchema(pluginName);
    const homebridgeConfig = await this.loadHomebridgeConfig();
    const ref = this.modalService.open(this.plugins[pluginName], {
      backdrop: 'static',
      size: 'lg',
    });
    ref.componentInstance.pluginName = pluginName;
    ref.componentInstance.schema = schema;
    ref.componentInstance.homebridgeConfig = homebridgeConfig;

    return ref.result.catch(() => {
      // do nothing
    });
  }

  async loadConfigSchema(pluginName) {
    return this.$api.get(`/plugins/config-schema/${encodeURIComponent(pluginName)}`).toPromise();
  }

  async loadHomebridgeConfig() {
    return this.$api.get('/config-editor').toPromise();
  }
}
