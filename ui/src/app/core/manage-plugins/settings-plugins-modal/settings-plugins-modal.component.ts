import { Component, OnInit, Input } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import * as uuid from 'uuid/v4';

import { ApiService } from '@/app/core/api.service';
import { AuthService } from '@/app/core/auth/auth.service';
import { NotificationService } from '@/app/core/notification.service';

export interface PluginConfigBlock {
  config: Record<string, any>;
  name: string;
  __uuid__: string;
}

@Component({
  selector: 'app-settings-plugins-modal',
  templateUrl: './settings-plugins-modal.component.html',
  styleUrls: ['./settings-plugins-modal.component.scss'],
})
export class SettingsPluginsModalComponent implements OnInit {
  @Input() plugin;
  @Input() schema;

  public pluginAlias: string;
  public pluginType: 'platform' | 'accessory';

  public pluginConfig: PluginConfigBlock[] = [];
  public form: any = {};
  public show = '';
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
    this.pluginAlias = this.schema.pluginAlias;
    this.pluginType = this.schema.pluginType;
    this.loadPluginConfig();
  }

  get arrayKey() {
    return this.pluginType === 'accessory' ? 'accessories' : 'platforms';
  }

  loadPluginConfig() {
    this.$api.get(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}`).subscribe(
      (pluginConfig) => {
        for (const block of pluginConfig) {
          const pluginConfigBlock = {
            __uuid__: uuid(),
            name: block.name || this.schema.pluginAlias,
            config: block,
          };
          this.pluginConfig.push(pluginConfigBlock);
        }

        if (!this.pluginConfig.length) {
          this.addBlock();
        } else {
          this.show = this.pluginConfig[0].__uuid__;
        }

        if (this.plugin.name === 'homebridge-hue' && this.pluginConfig.length) {
          this.homebridgeHueFix(this.pluginConfig[0].config);
        }
      },
      (err) => {
        this.$toastr.error('Failed to load config: ' + err.error?.message, this.translate.instant('toast.title_error'));
      },
    );
  }

  save() {
    this.saveInProgress = true;
    const configBlocks = this.pluginConfig.map(x => x.config);

    return this.$api.post(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}`, configBlocks)
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
        this.$toastr.error(this.translate.instant('config.toast_failed_to_save_config') + ': ' + err.error?.message, this.translate.instant('toast.title_error'));
      })
      .finally(() => {
        this.saveInProgress = false;
      });
  }

  blockChanged() {
    for (const block of this.pluginConfig) {
      block.name = block.config.name || block.name;
    }
  }

  addBlock() {
    const __uuid__ = uuid();

    this.pluginConfig.push({
      __uuid__: __uuid__,
      name: this.schema.pluginAlias,
      config: {
        [this.pluginType]: this.schema.pluginAlias,
      },
    });

    this.show = __uuid__;
    this.blockChanged();
  }

  removeBlock(__uuid__) {
    const pluginConfigIndex = this.pluginConfig.findIndex(x => x.__uuid__ === __uuid__);
    this.pluginConfig.splice(pluginConfigIndex, 1);
  }

  /**
   * Homebridge Hue - ensure users object is preserved
   */
  homebridgeHueFix(platform) {
    this.schema.schema.properties.users = {
      type: 'object',
      properties: {},
    };

    if (!platform.users || typeof platform.users !== 'object') {
      return;
    }

    for (const key of Object.keys(platform.users)) {
      this.schema.schema.properties.users.properties[key] = {
        type: 'string',
      };
    }
  }

}
