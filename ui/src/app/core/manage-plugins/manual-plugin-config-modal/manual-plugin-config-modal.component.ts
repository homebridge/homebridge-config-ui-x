import { Component, Input, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import * as JSON5 from 'json5';

import { ApiService } from '@/app/core/api.service';
import { AuthService } from '@/app/core/auth/auth.service';
import { MobileDetectService } from '@/app/core/mobile-detect.service';

@Component({
  selector: 'app-manual-plugin-config-modal',
  templateUrl: './manual-plugin-config-modal.component.html',
  styleUrls: ['./manual-plugin-config-modal.component.scss'],
})
export class ManualPluginConfigModalComponent implements OnInit {
  @Input() plugin;

  public pluginAlias: string;
  public pluginType: 'platform' | 'accessory';

  public loading = true;
  public canConfigure = false;
  public show = '';

  public homebridgeConfig;
  public currentBlock: string;
  public currentBlockIndex: number | null = null;
  public saveInProgress = false;

  public monacoEditor;
  public editorOptions = {
    language: 'json',
    theme: this.$auth.theme === 'dark-mode' ? 'vs-dark' : 'vs-light',
    automaticLayout: true,
  };

  constructor(
    public activeModal: NgbActiveModal,
    private $api: ApiService,
    private $auth: AuthService,
    private $toastr: ToastrService,
    private translate: TranslateService,
    private $router: Router,
    private $md: MobileDetectService,
  ) {
  }

  ngOnInit(): void {
    if (this.$md.detect.mobile()) {
      this.loading = false;
      this.canConfigure = false;
    } else {
      this.loadPluginAlias();
    }
  }

  async onEditorInit(editor) {
    this.monacoEditor = editor;
    window['editor'] = editor;
    await this.monacoEditor.getModel().setValue(this.currentBlock);
    await this.monacoEditor.getAction('editor.action.formatDocument').run();
  }

  loadPluginAlias() {
    this.$api.get(`/plugins/alias/${encodeURIComponent(this.plugin.name)}`).subscribe(
      (result) => {
        if (result.pluginAlias && result.pluginType) {
          this.pluginAlias = result.pluginAlias;
          this.pluginType = result.pluginType;
          this.loadHomebridgeConfig();
        } else {
          this.loading = false;
        }
      },
      (err) => {
        this.loading = false;
      },
    );
  }

  loadHomebridgeConfig() {
    this.$api.get('/config-editor').subscribe(
      (config) => {
        this.homebridgeConfig = config;

        if (!Array.isArray(this.homebridgeConfig.platforms)) {
          this.homebridgeConfig.platforms = [];
        }

        if (!Array.isArray(this.homebridgeConfig.accessories)) {
          this.homebridgeConfig.accessories = [];
        }

        this.canConfigure = true;
        this.loading = false;

        if (this.configBlocks().length) {
          this.editBlock(0);
        } else {
          this.addBlock();
        }
      },
    );
  }

  configBlocks(): Array<any> {
    if (this.pluginType === 'platform') {
      return this.homebridgeConfig.platforms.filter((platform: any) => {
        return platform.platform === this.pluginAlias ||
          platform.platform === this.plugin.name + '.' + this.pluginAlias;
      });
    } else if (this.pluginType === 'accessory') {
      return this.homebridgeConfig.accessories.filter((accessory: any) => {
        return accessory.accessory === this.pluginAlias ||
          accessory.accessory === this.plugin.name + '.' + this.pluginAlias;
      });
    }
  }

  addBlock() {
    if (!this.saveCurrentBlock()) {
      this.$toastr.error('Please fix validation errors before adding a new block.');
      return;
    }

    if (this.pluginType === 'platform') {
      this.homebridgeConfig.platforms.push({
        platform: this.pluginAlias,
        name: this.pluginAlias,
      });
    } else if (this.pluginType === 'accessory') {
      this.homebridgeConfig.accessories.push({
        accessory: this.pluginAlias,
        name: this.pluginAlias,
      });
    }

    this.editBlock((this.configBlocks().length - 1));
  }

  saveCurrentBlock() {
    if (this.currentBlockIndex !== null && this.monacoEditor) {
      const currentBlockString = this.monacoEditor.getModel().getValue();

      let currentBlockNew;

      try {
        currentBlockNew = JSON5.parse(currentBlockString);
      } catch (e) {
        this.$toastr.error(
          this.translate.instant('config.toast_config_invalid_json'),
          this.translate.instant('config.toast_title_config_syntax_error'),
        );
        return false;
      }

      if (Array.isArray(currentBlockNew) || typeof currentBlockNew !== 'object') {
        this.$toastr.error(
          this.translate.instant('Config block must be an object {}'),
          this.translate.instant('config.toast_title_config_syntax_error'),
        );
        return false;
      }

      if (this.pluginType === 'accessory' && !currentBlockNew.name) {
        this.$toastr.error(
          this.translate.instant('Accessory must have a "name" attribute'),
          this.translate.instant('config.toast_title_config_syntax_error'),
        );
        return false;
      }

      const currentBlock = this.configBlocks()[this.currentBlockIndex];
      Object.keys(currentBlock).forEach((x) => delete currentBlock[x]);
      Object.assign(currentBlock, currentBlockNew);

      currentBlock[this.pluginType] = this.pluginAlias;
    }

    return true;
  }

  editBlock(index: number) {
    if (!this.saveCurrentBlock()) {
      return;
    }

    this.show = 'configBlock.' + index;
    this.currentBlockIndex = index;
    this.currentBlock = JSON.stringify(this.configBlocks()[this.currentBlockIndex], null, 4);
  }

  removeBlock(index: number) {
    const block = this.configBlocks()[index];

    if (this.pluginType === 'accessory') {
      const blockIndex = this.homebridgeConfig.accessories.findIndex((x) => x === block);
      if (blockIndex > -1) {
        this.homebridgeConfig.accessories.splice(blockIndex, 1);
      }
    } else if (this.pluginType === 'platform') {
      const blockIndex = this.homebridgeConfig.platforms.findIndex((x) => x === block);
      if (blockIndex > -1) {
        this.homebridgeConfig.platforms.splice(blockIndex, 1);
      }
    }

    this.currentBlockIndex = null;
    this.currentBlock = undefined;
    this.show = '';
  }

  save() {
    this.saveInProgress = true;
    if (!this.saveCurrentBlock()) {
      this.saveInProgress = false;
      return;
    }

    return this.$api.post('/config-editor', this.homebridgeConfig)
      .toPromise()
      .then(data => {
        this.$toastr.success(
          this.translate.instant('plugins.settings.toast_restart_required'),
          this.translate.instant('plugins.settings.toast_plugin_config_saved'),
        );
        this.activeModal.close();
      })
      .catch(err => {
        this.$toastr.error(this.translate.instant('config.toast_failed_to_save_config'), this.translate.instant('toast.title_error'));
        this.saveInProgress = false;
      });
  }

  openFullConfigEditor() {
    this.$router.navigate(['/config']);
    this.activeModal.close();
  }

}
