import { Component, OnInit, Input } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { StateService, isArray } from '@uirouter/angular';
import { ToastrService } from 'ngx-toastr';
import 'brace/theme/xcode';
import 'brace/mode/json';

import { environment } from '../../environments/environment';
import { ApiService } from '../_services/api.service';
import { AuthService } from '../_services/auth.service';
import { MobileDetectService } from '../_services/mobile-detect.service';
import { ConfigRestoreBackupComponent } from './config.restore-backup.component';

@Component({
  selector: 'app-config',
  templateUrl: './config.component.html'
})
export class ConfigComponent implements OnInit {
  @Input() homebridgeConfig;
  public saveInProgress: boolean;
  public isMobile: any = false;
  public backupUrl: string;
  public options: any = { printMargin: false };

  constructor(
    private $api: ApiService,
    private $auth: AuthService,
    private $md: MobileDetectService,
    public toastr: ToastrService,
    private translate: TranslateService,
    private modalService: NgbModal
  ) {
    this.backupUrl = environment.apiBaseUrl + '/api/backup/config.json?token=' + this.$auth.user.token;
    this.isMobile = this.$md.detect.mobile();

    // remove editor gutter on small screen devices
    if (this.$md.detect.phone()) {
      this.options.showGutter = false;
    }

    // make font size 16px on touch devices to prevent zoom
    if (this.$md.detect.mobile()) {
      this.options.fontSize = '16px';
    }
  }

  ngOnInit() {}

  async onSave() {
    if (this.saveInProgress) {
      return;
    }

    this.saveInProgress = true;
    // verify homebridgeConfig contains valid json
    try {
      const config = JSON.parse(this.homebridgeConfig);

      // basic validation of homebridge config spec
      if (typeof(config.bridge) !== 'object') {
        this.toastr.error(
          this.translate.instant('config.toast_config_bridge_missing'),
          this.translate.instant('config.toast_title_config_error')
        );
      } else if (!/^([0-9A-Fa-f]{2}[:]){5}([0-9A-Fa-f]{2})$/.test(config.bridge.username)) {
        this.toastr.error(
          this.translate.instant('config.toast_config_username_format_error'),
          this.translate.instant('config.toast_title_config_error')
        );
      } else if (config.accessories && !isArray(config.accessories)) {
        this.toastr.error(
          this.translate.instant('config.toast_config_accessory_must_be_array'),
          this.translate.instant('config.toast_title_config_error')
        );
      } else if (config.platforms && !isArray(config.platforms)) {
        this.toastr.error(
          this.translate.instant('config.toast_config_platform_must_be_array'),
          this.translate.instant('config.toast_title_config_error')
        );
      } else {
        await this.saveConfig(config);
      }
    } catch (e) {
      this.toastr.error(
        this.translate.instant('config.toast_config_invalid_json'),
        this.translate.instant('config.toast_title_config_syntax_error')
      );
    }
    this.saveInProgress = false;
  }

  saveConfig(config) {
    return this.$api.saveConfig(config)
      .toPromise()
      .then(data => {
        this.toastr.success(this.translate.instant('config.toast_config_saved'), this.translate.instant('toast.title_success'));
        this.homebridgeConfig = JSON.stringify(data, null, 4);
      })
      .catch(err => {
        this.toastr.error(this.translate.instant('config.toast_failed_to_save_config'), this.translate.instant('toast.title_error'));
      });
  }

  onRestore() {
    this.modalService.open(ConfigRestoreBackupComponent, {
      size: 'lg',
    })
    .result
    .then((backupId) => {
      this.$api.getConfigBackup(backupId).subscribe(
        data => {
          this.toastr.warning(
            this.translate.instant('config.toast_click_save_to_confirm_backup_restore'),
            this.translate.instant('config.toast_title_backup_loaded')
          );
          this.homebridgeConfig = data;
        },
        err => this.toastr.error(err.error.message || 'Failed to load config backup', this.translate.instant('toast.title_error'))
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
