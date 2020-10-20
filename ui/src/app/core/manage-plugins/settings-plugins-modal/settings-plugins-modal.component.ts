import { Component, OnInit, Input } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import * as uuid from 'uuid/v4';

import { ApiService } from '@/app/core/api.service';
import { AuthService } from '@/app/core/auth/auth.service';
import { NotificationService } from '@/app/core/notification.service';

@Component({
  selector: 'app-settings-plugins-modal',
  templateUrl: './settings-plugins-modal.component.html',
  styleUrls: ['./settings-plugins-modal.component.scss'],
})
export class SettingsPluginsModalComponent implements OnInit {
  @Input() plugin;

  public pluginAlias: string;
  public pluginType: 'platform' | 'accessory';

  public homebridgeConfig: any;
  public configSchema: any = {};
  public pluginConfig = [];
  public form: any = {};
  public show;
  public saveInProgress: boolean;

  constructor(
    public activeModal: NgbActiveModal,
    private $api: ApiService,
    private $auth: AuthService,
    private $notification: NotificationService,
    private $toastr: ToastrService,
    private translate: TranslateService,
  ) { }

  ngOnInit() {
    this.loadConfigSchema();
  }

  get arrayKey() {
    return this.pluginType === 'accessory' ? 'accessories' : 'platforms';
  }

  blockChanged(__uuid__, blockName) {
    return (config) => {
      config.__uuid__ = __uuid__;
      config[this.pluginType] = blockName;
      const index = this.homebridgeConfig[this.arrayKey].findIndex(x => x.__uuid__ === __uuid__);
      this.homebridgeConfig[this.arrayKey][index] = config;
    };
  }

  addBlock() {
    if (!this.homebridgeConfig[this.arrayKey]) {
      this.homebridgeConfig[this.arrayKey] = [];
    }
    const __uuid__ = uuid();

    const blockConfig = {
      __uuid__: __uuid__,
      name: 'New ' + this.configSchema.pluginAlias + ' #' + (this.pluginConfig.length + 1),
      onChange: this.blockChanged(__uuid__, this.configSchema.pluginAlias),
    };

    const baseConfig = {
      [this.pluginType]: this.configSchema.pluginAlias,
      __uuid__: __uuid__,
    };

    this.homebridgeConfig[this.arrayKey].push(baseConfig);
    this.pluginConfig.push(blockConfig);

    this.show = __uuid__;
  }

  removeBlock(__uuid__) {
    const pluginConfigIndex = this.pluginConfig.findIndex(x => x.__uuid__ === __uuid__);
    this.pluginConfig.splice(pluginConfigIndex, 1);

    const homebridgeConfigIndex = this.homebridgeConfig[this.arrayKey].findIndex(x => x.__uuid__ === __uuid__);
    this.homebridgeConfig[this.arrayKey].splice(homebridgeConfigIndex, 1);
  }

  loadConfigSchema() {
    this.$api.get(`/plugins/config-schema/${encodeURIComponent(this.plugin.name)}`).subscribe(
      (schema) => {
        this.pluginAlias = schema.pluginAlias;
        this.pluginType = schema.pluginType;
        this.configSchema = schema;
        this.loadHomebridgeConfig();
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

        this.homebridgeConfig[this.arrayKey].forEach((block: any) => {
          if (
            block[this.pluginType] === this.configSchema.pluginAlias ||
            block[this.pluginType] === this.plugin.name + '.' + this.configSchema.pluginAlias
          ) {
            block.__uuid__ = uuid();

            // Homebridge Hue - ensure users object is preserved
            if (this.plugin.name === 'homebridge-hue') {
              this.homebridgeHueFix(block);
            }

            const blockConfig: any = {
              config: block,
              onChange: this.blockChanged(block.__uuid__, block[this.pluginType]),
              __uuid__: block.__uuid__,
              name: block.name || block[this.pluginType],
            };

            this.pluginConfig.push(blockConfig);
          }
        });

        if (!this.pluginConfig.length) {
          this.addBlock();
        }
      },
    );
  }

  async save() {
    this.saveInProgress = true;

    this.homebridgeConfig.platforms.forEach((platform: any) => {
      delete platform.__uuid__;
    });

    this.homebridgeConfig.accessories.forEach((accessory: any) => {
      delete accessory.__uuid__;
    });

    await this.$api.post('/config-editor', this.homebridgeConfig)
      .toPromise()
      .then((done) => {
        this.$toastr.success(
          this.translate.instant('plugins.settings.toast_restart_required'),
          this.translate.instant('plugins.settings.toast_plugin_config_saved'),
        );

        this.activeModal.close();
        this.$notification.configUpdated.next();

        // reload app settings if the config was changed for Homebridge Config UI X
        if (this.plugin.name === 'homebridge-config-ui-x') {
          this.$auth.getAppSettings().catch(/* do nothing */);
        }
      })
      .catch(err => {
        this.$toastr.error(this.translate.instant('config.toast_failed_to_save_config'), this.translate.instant('toast.title_error'));
      });

    this.saveInProgress = false;
  }

  /**
   * Homebridge Hue - ensure users object is preserved
   */
  homebridgeHueFix(platform) {
    this.configSchema.schema.properties.users = {
      type: 'object',
      properties: {},
    };

    if (!platform.users || typeof platform.users !== 'object') {
      return;
    }

    for (const key of Object.keys(platform.users)) {
      this.configSchema.schema.properties.users.properties[key] = {
        type: 'string',
      };
    }
  }

}
