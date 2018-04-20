import { Component, OnInit, Input } from '@angular/core';
import { StateService } from '@uirouter/angular';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastsManager } from 'ng2-toastr/src/toast-manager';
import * as uuid from 'uuid/v4';

import { ApiService } from '../_services/api.service';

@Component({
  selector: 'app-plugins.settings',
  templateUrl: './plugins.settings.component.html',
  styleUrls: ['./plugins.component.scss']
})
export class PluginSettingsComponent implements OnInit {
  @Input() pluginName;
  public homebridgeConfig: any;
  public configSchema: any = {};
  public pluginConfig = [];
  public form: any = {};
  public show;

  public jsonFormOptions = {
    addSubmit: false,
    loadExternalAssets: false,
    returnEmptyFields: false,
    setSchemaDefaults: true
  };

  constructor(
    public activeModal: NgbActiveModal,
    private $api: ApiService,
    private $state: StateService,
    private toastr: ToastsManager
  ) { }

  ngOnInit() {
    this.loadConfigSchema();
  }

  blockChanged(__uuid__) {
    if (this.configSchema.pluginType === 'platform') {
      return (config) => {
        config.__uuid__ = __uuid__;
        config.platform = this.configSchema.pluginAlias;
        const index = this.homebridgeConfig.platforms.findIndex(x => x.__uuid__ === __uuid__);
        this.homebridgeConfig.platforms[index] = config;
      };
    } else if (this.configSchema.pluginType === 'accessory') {
      return (config) => {
        config.__uuid__ = __uuid__;
        config.accessory = this.configSchema.pluginAlias;
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
        onChange: this.blockChanged(__uuid__)
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
        onChange: this.blockChanged(__uuid__)
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
    this.$api.getPluginConfigSchema(this.pluginName).subscribe(
      (schema) => {
        this.configSchema = schema;
        this.loadHomebridgeConfig();
      },
    );
  }

  loadHomebridgeConfig() {
    this.$api.getConfig().subscribe(
      (config) => {
        this.homebridgeConfig = config;

        if (this.homebridgeConfig.platforms && this.configSchema.pluginType === 'platform') {
          this.homebridgeConfig.platforms.forEach((platform: any) => {
            if (platform.platform === this.configSchema.pluginAlias) {
              platform.__uuid__ = uuid();

              const platformConfig: any = {
                config: platform,
                onChange: this.blockChanged(platform.__uuid__),
                __uuid__: platform.__uuid__,
                name: platform.name || platform.platform
              };

              this.pluginConfig.push(platformConfig);
            }
          });
        } else if (this.homebridgeConfig.accessories && this.configSchema.pluginType === 'accessory') {
          this.homebridgeConfig.accessories.forEach((accessory: any) => {
            if (accessory.accessory === this.configSchema.pluginAlias) {
              accessory.__uuid__ = uuid();

              const accessoryConfig: any = {
                config: accessory,
                onChange: this.blockChanged(accessory.__uuid__),
                __uuid__: accessory.__uuid__,
                name: accessory.name || accessory.platform
              };

              this.pluginConfig.push(accessoryConfig);
            }
          });
        }

        if (!this.pluginConfig.length) {
          this.addBlock();
        }
      }
    );
  }

  save() {
    this.homebridgeConfig.platforms.forEach((platform: any) => {
      delete platform.__uuid__;
    });

    this.homebridgeConfig.accessories.forEach((accessory: any) => {
      delete accessory.__uuid__;
    });

    this.$api.saveConfig(this.homebridgeConfig).subscribe(
      (done) => {
        this.toastr.success('Restart Homebridge to apply the changes.', 'Plugin Config Saved');
        this.activeModal.close();
      }
    );
  }

}
