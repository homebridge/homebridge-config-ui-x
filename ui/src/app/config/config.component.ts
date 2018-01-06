import { Component, OnInit, Input, ViewContainerRef } from '@angular/core';
import { Observable } from 'rxjs/Observable';

import { StateService, isArray } from '@uirouter/angular';
import { ToastsManager } from 'ng2-toastr/ng2-toastr';
import 'brace/theme/xcode';
import 'brace/mode/json';

import { ApiService } from '../_services/api.service';

@Component({
  selector: 'app-config',
  templateUrl: './config.component.html',
  styleUrls: ['./config.component.scss']
})
class ConfigComponent implements OnInit {
  @Input() homebridgeConfig;
  options: any = { printMargin: false };

  constructor(
    private $api: ApiService,
    public toastr: ToastsManager
  ) {}

  ngOnInit() {
  }

  onSave() {
    // verify homebridgeConfig contains valid json
    try {
      const config = JSON.parse(this.homebridgeConfig);

      // basic validation of homebridge config spec
      if (typeof(config.bridge) !== 'object') {
        this.toastr.error('Bridge settings missing', 'Config Error');
      } else if (config.accessories && !isArray(config.accessories)) {
        this.toastr.error('Accessories must be an array []', 'Config Error');
      } else if (config.platforms && !isArray(config.platforms)) {
        this.toastr.error('Platforms must be an array []', 'Config Error');
      } else {
        this.saveConfig(config);
      }
    } catch (e) {
      this.toastr.error('Config contains invalid JSON', 'Config Syntax Error');
    }
  }

  saveConfig(config) {
    this.$api.saveConfig(config).subscribe(
      data => this.toastr.success('Config saved', 'Success!'),
      err => this.toastr.error('Failed to save config', 'Error')
    );
  }

  downloadConfigBackup() {
    this.$api.downloadConfigBackup();
  }

}

const ConfigStates = {
  name: 'config',
  url: '/config',
  component: ConfigComponent,
  resolve: [{
    token: 'homebridgeConfig',
    deps: [ApiService, ToastsManager, StateService],
    resolveFn: ($api, toastr, $state) => $api.loadConfig().toPromise().catch((err) => {
      toastr.error(err.message, 'Failed to Load Config');
      $state.go('status');
    })
  }]
};

export { ConfigComponent, ConfigStates };
