import { Component, OnInit, Input } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { StateService, isArray } from '@uirouter/angular';
import { ToastrService } from 'ngx-toastr';
import 'brace/theme/xcode';
import 'brace/mode/json';

import { ApiService } from '../_services/api.service';
import { MobileDetectService } from '../_services/mobile-detect.service';
import { ConfigRestoreBackupComponent } from './config.restore-backup.component';

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
    public toastr: ToastrService,
    private modalService: NgbModal,
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
        this.homebridgeConfig = JSON.stringify(data, null, 4);
        this.generateBackupConfigLink();
      },
      err => this.toastr.error('Failed to save config', 'Error')
    );
  }

  generateBackupConfigLink() {
    const theJSON = this.homebridgeConfig;
    const uri = this.sanitizer.bypassSecurityTrustUrl('data:text/json;charset=UTF-8,' + encodeURIComponent(theJSON));
    this.backupConfigHref = uri;
  }

  onRestore() {
    this.modalService.open(ConfigRestoreBackupComponent, {
      size: 'lg',
    })
    .result
    .then((backupId) => {
      this.$api.getConfigBackup(backupId).subscribe(
        data => {
          this.toastr.warning('Click Save to confirm you want to restore this backup.', 'Backup Loaded');
          this.homebridgeConfig = data;
          this.generateBackupConfigLink();
        },
        err => this.toastr.error(err.error.message || 'Failed to load config backup', 'Error')
      );
    })
    .catch(() => { /* modal dismissed */ });
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
    deps: [ApiService, ToastrService, StateService],
    resolveFn: configStateResolve
  }],
  data: {
    requiresAuth: true,
    requiresAdmin: true
  }
};
