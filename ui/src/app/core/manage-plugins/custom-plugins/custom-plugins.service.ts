import { Injectable } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { HomebridgeGoogleSmarthomeComponent } from './homebridge-google-smarthome/homebridge-google-smarthome.component';
import { ApiService } from '../../api.service';

@Injectable({
  providedIn: 'root',
})
export class CustomPluginsService {

  public plugins = {
    'homebridge-gsh': HomebridgeGoogleSmarthomeComponent,
  };

  constructor(
    private modalService: NgbModal,
    private $api: ApiService,
  ) { }

  async openSettings(pluginName: string) {
    const schema = await this.loadConfigSchema(pluginName);
    const homebridgeConfig = await this.loadHomebridgeConfig();
    const ref = this.modalService.open(this.plugins[pluginName], {
      size: 'lg',
    });
    ref.componentInstance.pluginName = pluginName;
    ref.componentInstance.schema = schema;
    ref.componentInstance.homebridgeConfig = homebridgeConfig;
  }

  async loadConfigSchema(pluginName) {
    return this.$api.get(`/plugins/config-schema/${encodeURIComponent(pluginName)}`).toPromise();
  }

  async loadHomebridgeConfig() {
    return this.$api.get('/config-editor').toPromise();
  }
}
