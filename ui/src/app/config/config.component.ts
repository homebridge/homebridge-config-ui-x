import { Component, OnInit, Input } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

import { StateService, isArray } from '@uirouter/angular';
import { ToastsManager } from 'ng2-toastr/ng2-toastr';
import 'brace/theme/xcode';
import 'brace/mode/json';

import { ApiService } from '../_services/api.service';
import { MobileDetectService } from '../_services/mobile-detect.service';

@Component({
  selector: 'app-config',
  templateUrl: './config.component.html'
})
export class ConfigComponent implements OnInit {
  @Input() homebridgeConfig;
  backupConfigHref: SafeUrl;
  options: any = { printMargin: false };

  constructor(
    private $api: ApiService,
    private $md: MobileDetectService,
    public toastr: ToastsManager,
    private sanitizer: DomSanitizer
  ) {
    // remove editor gutter on small screen devices
    if ($md.detect.phone()) {
      this.options.showGutter = false;
    }

    // make font size 16px on touch devices to prevent zoom
    if ($md.detect.mobile()) {
      this.options.fontSize = '16px';
    }
  }

  ngOnInit() {
    this.generateBackupConfigLink();
  }

  onSave() {
    // verify homebridgeConfig contains valid json
    try {
      const config = JSON.parse(this.homebridgeConfig);

      // basic validation of homebridge config spec
      if (typeof(config.bridge) !== 'object') {
        this.toastr.error('Bridge settings missing', 'Config Error');
      } else if (!/^([0-9A-Fa-f]{2}[:]){5}([0-9A-Fa-f]{2})$/.test(config.bridge.username)) {
        this.toastr.error('Bridge username must be 6 pairs of colon-separated hexadecimal characters (A-F 0-9)', 'Config Error');
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
      data => {
        this.toastr.success('Config saved', 'Success!');
        this.generateBackupConfigLink();
        this.homebridgeConfig = JSON.stringify(data, null, 4);
      },
      err => this.toastr.error('Failed to save config', 'Error')
    );
  }

  generateBackupConfigLink() {
    const theJSON = this.homebridgeConfig;
    const uri = this.sanitizer.bypassSecurityTrustUrl('data:text/json;charset=UTF-8,' + encodeURIComponent(theJSON));
    this.backupConfigHref = uri;
  }

}

export function configStateResolve ($api, toastr, $state) {
  return $api.loadConfig().toPromise().catch((err) => {
    toastr.error(err.message, 'Failed to Load Config');
    $state.go('status');
  });
}

export const ConfigStates = {
  name: 'config',
  url: '/config',
  component: ConfigComponent,
  resolve: [{
    token: 'homebridgeConfig',
    deps: [ApiService, ToastsManager, StateService],
    resolveFn: configStateResolve
  }],
  data: {
    requiresAuth: true,
    requiresAdmin: true
  }
};
