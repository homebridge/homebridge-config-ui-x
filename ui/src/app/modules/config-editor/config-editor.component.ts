import { Component, OnInit, ViewChild, AfterViewInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';

import 'brace/theme/xcode';
import 'brace/mode/json';

import { ApiService } from '../../core/api.service';
import { MobileDetectService } from '../../core/mobile-detect.service';
import { ConfigRestoreBackupComponent } from './config-restore-backup/config.restore-backup.component';
import { ActivatedRoute } from '@angular/router';
import { AceEditorComponent } from 'ng2-ace-editor';

declare var ace: any;

@Component({
  selector: 'app-config',
  templateUrl: './config-editor.component.html',
})
export class ConfigEditorComponent implements OnInit {
  @ViewChild('editor', { static: false }) editor: AceEditorComponent;

  public homebridgeConfig: string;
  public saveInProgress: boolean;
  public isMobile: any = false;
  public backupUrl: string;
  public options: any = { printMargin: false };
  public currentMarker;

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

    if (this.currentMarker) {
      this.editor.getEditor().session.removeMarker(this.currentMarker);
    }

    this.saveInProgress = true;
    // verify homebridgeConfig contains valid json
    try {
      const config = JSON.parse(this.homebridgeConfig);
      // ensure it's formatted so errors can be easily spotted
      this.homebridgeConfig = JSON.stringify(config, null, 4);

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
      } else if (config.platforms && Array.isArray(config.platforms) && !this.validateSection(config.platforms, 'platform')) {
        // handled in validator function
      } else if (config.accessories && Array.isArray(config.accessories) && !this.validateSection(config.accessories, 'accessory')) {
        // handled in validator function
      } else if (config.plugins && Array.isArray(config.plugins) && !this.validatePlugins(config.plugins)) {
        // handled in validator function
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

  validateSection(sections: any[], type: 'accessory' | 'platform') {
    for (const section of sections) {
      // check section is an object
      if (typeof section !== 'object' || Array.isArray(section)) {
        this.$toastr.error(`All ${type} blocks must be objects.`);
        this.highlightOffendingArrayItem(section);
        return false;
      }

      // check section contains platform/accessory key
      if (!section[type]) {
        this.$toastr.error(`All ${type} blocks must contain the "${type}" attribute.`);
        this.highlightOffendingArrayItem(section);
        return false;
      }

      // check section platform/accessory key is a string
      if (typeof section[type] !== 'string') {
        this.$toastr.error(`The "${type}" attribute must be a string.`);
        this.highlightOffendingArrayItem(section);
        return false;
      }
    }

    // validation passed
    return true;
  }

  validatePlugins(plugins: any[]) {
    for (const item of plugins) {
      if (typeof item !== 'string') {
        this.$toastr.error(`Each item in the plugins array must be a string.`);
        return false;
      }
    }
    return true;
  }

  highlightOffendingArrayItem(block) {
    // figure out which lines the offending block spans
    block = JSON.stringify(block, null, 4).split('\n').map(x => x.trim()).join('\n');
    const trimedConfig = this.homebridgeConfig.split('\n').map(x => x.trim()).join('\n');
    const markedConfig = trimedConfig.replace(`\n${block}\n`, `\n____START____\n${block}\n____END____\n`);
    const from = markedConfig.split('\n').findIndex(x => x === '____START____');
    const to = markedConfig.split('\n').findIndex(x => x === '____END____') - 2;

    // highlight those lines
    const Range = ace.require('ace/range').Range;
    this.currentMarker = this.editor.getEditor().session.addMarker(new Range(from, 0, to, 1), 'hb-editor-block-error', 'fullLine');
  }

}
