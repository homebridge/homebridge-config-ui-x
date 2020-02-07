import { Component, OnInit, Input } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import * as uuid from 'uuid/v4';
import { ApiService } from '../../api.service';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-settings-plugins-modal',
  templateUrl: './settings-plugins-modal.component.html',
  styleUrls: ['./settings-plugins-modal.component.scss'],
})
export class SettingsPluginsModalComponent implements OnInit {
  @Input() pluginName;
  public homebridgeConfig: any;
  public configSchema: any = {};
  public pluginConfig = [];
  public form: any = {};
  public show;
  public saveInProgress: boolean;

  public jsonFormOptions = {
    addSubmit: false,
    loadExternalAssets: false,
    returnEmptyFields: false,
    setSchemaDefaults: true,
  };

  constructor(
    public activeModal: NgbActiveModal,
    private $api: ApiService,
    private $auth: AuthService,
    private $toastr: ToastrService,
    private translate: TranslateService,
  ) { }

  ngOnInit() {
    this.loadConfigSchema();
  }

  blockChanged(__uuid__, blockName) {
    if (this.configSchema.pluginType === 'platform') {
      return (config) => {
        config.__uuid__ = __uuid__;
        config.platform = blockName;
        const index = this.homebridgeConfig.platforms.findIndex(x => x.__uuid__ === __uuid__);
        this.homebridgeConfig.platforms[index] = config;
      };
    } else if (this.configSchema.pluginType === 'accessory') {
      return (config) => {
        config.__uuid__ = __uuid__;
        config.accessory = blockName;
        const index = this.homebridgeConfig.accessories.findIndex(x => x.__uuid__ === __uuid__);
        this.homebridgeConfig.accessories[index] = config;
      };
    }
  }

  addBlock() {
    if (this.configSchema.pluginType === 'platform') {
      if (!this.homebridgeConfig.platforms) {
        this.homebridgeConfig.platforms = [];
      }
      const __uuid__ = uuid();

      const platformConfig = {
        __uuid__: __uuid__,
        name: 'New ' + this.configSchema.pluginAlias + ' Platform #' + (this.pluginConfig.length + 1),
        onChange: this.blockChanged(__uuid__, this.configSchema.pluginAlias),
      };

      const baseConfig = {
        platform: this.configSchema.pluginAlias,
        __uuid__: __uuid__,
      };

      this.homebridgeConfig.platforms.push(baseConfig);
      this.pluginConfig.push(platformConfig);

      this.show = __uuid__;
    } else if (this.configSchema.pluginType === 'accessory') {
      if (!this.homebridgeConfig.accessories) {
        this.homebridgeConfig.accessories = [];
      }
      const __uuid__ = uuid();

      const accessoryConfig = {
        __uuid__: __uuid__,
        name: 'New ' + this.configSchema.pluginAlias + ' Accessory #' + (this.pluginConfig.length + 1),
        onChange: this.blockChanged(__uuid__, this.configSchema.pluginAlias),
      };

      const baseConfig = {
        accessory: this.configSchema.pluginAlias,
        __uuid__: __uuid__,
      };

      this.homebridgeConfig.accessories.push(baseConfig);
      this.pluginConfig.push(accessoryConfig);

      this.show = __uuid__;
    }
  }

  removeBlock(__uuid__) {
    const pluginConfigIndex = this.pluginConfig.findIndex(x => x.__uuid__ === __uuid__);
    this.pluginConfig.splice(pluginConfigIndex, 1);

    if (this.configSchema.pluginType === 'platform') {
      const homebridgeConfigIndex = this.homebridgeConfig.platforms.findIndex(x => x.__uuid__ === __uuid__);
      this.homebridgeConfig.platforms.splice(homebridgeConfigIndex, 1);
    } else if (this.configSchema.pluginType === 'accessory') {
      const homebridgeConfigIndex = this.homebridgeConfig.accessories.findIndex(x => x.__uuid__ === __uuid__);
      this.homebridgeConfig.accessories.splice(homebridgeConfigIndex, 1);
    }
  }

  loadConfigSchema() {
    this.$api.get(`/plugins/config-schema/${encodeURIComponent(this.pluginName)}`).subscribe(
      (schema) => {
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

        if (this.homebridgeConfig.platforms && this.configSchema.pluginType === 'platform') {
          this.homebridgeConfig.platforms.forEach((platform: any) => {
            if (
              platform.platform === this.configSchema.pluginAlias ||
              platform.platform === this.pluginName + '.' + this.configSchema.pluginAlias
            ) {
              platform.__uuid__ = uuid();

              // Homebridge Hue - ensure users object is preserved
              if (this.pluginName === 'homebridge-hue') {
                this.homebridgeHueFix(platform);
              }

              const platformConfig: any = {
                config: platform,
                onChange: this.blockChanged(platform.__uuid__, platform.platform),
                __uuid__: platform.__uuid__,
                name: platform.name || platform.platform,
              };

              this.pluginConfig.push(platformConfig);
            }
          });
        } else if (this.homebridgeConfig.accessories && this.configSchema.pluginType === 'accessory') {
          this.homebridgeConfig.accessories.forEach((accessory: any) => {
            if (
              accessory.accessory === this.configSchema.pluginAlias ||
              accessory.accessory === this.pluginName + '.' + this.configSchema.pluginAlias
            ) {
              accessory.__uuid__ = uuid();

              const accessoryConfig: any = {
                config: accessory,
                onChange: this.blockChanged(accessory.__uuid__, accessory.accessory),
                __uuid__: accessory.__uuid__,
                name: accessory.name || accessory.accessory,
              };

              this.pluginConfig.push(accessoryConfig);
            }
          });
        }

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

        // reload app settings if the config was changed for Homebridge Config UI X
        if (this.pluginName === 'homebridge-config-ui-x') {
          this.$auth.getAppSettings();
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
