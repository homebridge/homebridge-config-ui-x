import { Component, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import 'brace/theme/xcode';
import 'brace/mode/json';

import { ApiService } from '../../core/api.service';
import { MobileDetectService } from '../../core/mobile-detect.service';
import { ConfigRestoreBackupComponent } from './config-restore-backup/config.restore-backup.component';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-config',
  templateUrl: './config-editor.component.html',
})
export class ConfigEditorComponent implements OnInit {
  public homebridgeConfig: string;
  public saveInProgress: boolean;
  public isMobile: any = false;
  public backupUrl: string;
  public options: any = { printMargin: false };

  constructor(
    private $api: ApiService,
    private $md: MobileDetectService,
    public $toastr: ToastrService,
    private $route: ActivatedRoute,
    private translate: TranslateService,
    private modalService: NgbModal,
  ) {
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

  ngOnInit() {
    this.$route.data
      .subscribe((data: { config: string }) => {
        this.homebridgeConfig = data.config;
      });
  }

  async onSave() {
    if (this.saveInProgress) {
      return;
    }

    this.saveInProgress = true;
    // verify homebridgeConfig contains valid json
    try {
      const config = JSON.parse(this.homebridgeConfig);

      // basic validation of homebridge config spec
      if (typeof (config.bridge) !== 'object') {
        this.$toastr.error(
          this.translate.instant('config.toast_config_bridge_missing'),
          this.translate.instant('config.toast_title_config_error'),
        );
      } else if (!/^([0-9A-Fa-f]{2}[:]){5}([0-9A-Fa-f]{2})$/.test(config.bridge.username)) {
        this.$toastr.error(
          this.translate.instant('config.toast_config_username_format_error'),
          this.translate.instant('config.toast_title_config_error'),
        );
      } else if (config.accessories && !Array.isArray(config.accessories)) {
        this.$toastr.error(
          this.translate.instant('config.toast_config_accessory_must_be_array'),
          this.translate.instant('config.toast_title_config_error'),
        );
      } else if (config.platforms && !Array.isArray(config.platforms)) {
        this.$toastr.error(
          this.translate.instant('config.toast_config_platform_must_be_array'),
          this.translate.instant('config.toast_title_config_error'),
        );
      } else {
        await this.saveConfig(config);
      }
    } catch (e) {
      this.$toastr.error(
        this.translate.instant('config.toast_config_invalid_json'),
        this.translate.instant('config.toast_title_config_syntax_error'),
      );
    }
    this.saveInProgress = false;
  }

  saveConfig(config) {
    return this.$api.post('/config-editor', config)
      .toPromise()
      .then(data => {
        this.$toastr.success(this.translate.instant('config.toast_config_saved'), this.translate.instant('toast.title_success'));
        this.homebridgeConfig = JSON.stringify(data, null, 4);
      })
      .catch(err => {
        this.$toastr.error(this.translate.instant('config.toast_failed_to_save_config'), this.translate.instant('toast.title_error'));
      });
  }

  onRestore() {
    this.modalService.open(ConfigRestoreBackupComponent, {
      size: 'lg',
    })
      .result
      .then((backupId) => {
        this.$api.get(`/config-editor/backups/${backupId}`).subscribe(
          json => {
            this.$toastr.warning(
              this.translate.instant('config.toast_click_save_to_confirm_backup_restore'),
              this.translate.instant('config.toast_title_backup_loaded'),
            );
            this.homebridgeConfig = JSON.stringify(json, null, 4);
          },
          err => this.$toastr.error(err.error.message || 'Failed to load config backup', this.translate.instant('toast.title_error')),
        );
      })
      .catch(() => { /* modal dismissed */ });
  }

  onExportConfig() {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(this.homebridgeConfig);
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute('href', dataStr);
    downloadAnchorNode.setAttribute('download', 'config.json');
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  }

}
