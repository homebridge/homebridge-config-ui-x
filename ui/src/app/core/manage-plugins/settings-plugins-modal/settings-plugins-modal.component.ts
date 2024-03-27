import { Component, Input, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import { v4 as uuid } from 'uuid';
import { ApiService } from '@/app/core/api.service';
import { DonateModalComponent } from '@/app/core/manage-plugins/donate-modal/donate-modal.component';
import { PluginLogModalComponent } from '@/app/core/manage-plugins/plugin-log-modal/plugin-log-modal.component';
import { NotificationService } from '@/app/core/notification.service';
import { SettingsService } from '@/app/core/settings.service';

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
  @Input() plugin: any;
  @Input() schema: any;

  public pluginAlias: string;
  public pluginType: 'platform' | 'accessory';
  public pluginConfig: PluginConfigBlock[] = [];
  public form: any = {};
  public show = '';
  public saveInProgress: boolean;
  public justSavedAndExited = false;

  public childBridges: any[] = [];

  constructor(
    public activeModal: NgbActiveModal,
    private $api: ApiService,
    private $modal: NgbModal,
    private $settings: SettingsService,
    private $notification: NotificationService,
    private $router: Router,
    private $toastr: ToastrService,
    private translate: TranslateService,
  ) {}

  ngOnInit() {
    this.pluginAlias = this.schema.pluginAlias;
    this.pluginType = this.schema.pluginType;
    this.loadPluginConfig();
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
          this.show = this.pluginConfig[0].__uuid__; // eslint-disable-line no-underscore-dangle
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

  async save() {
    this.saveInProgress = true;
    const configBlocks = this.pluginConfig.map(x => x.config);

    try {
      await this.$api.post(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}`, configBlocks)
        .toPromise();

      // reload app settings if the config was changed for Homebridge UI
      if (this.plugin.name === 'homebridge-config-ui-x') {
        this.$settings.getAppSettings().catch();
      }

      this.getChildBridges();
      this.justSavedAndExited = true;
    } catch (err) {
      this.$toastr.error(
        this.translate.instant('config.toast_failed_to_save_config') + ': ' + err.error?.message,
        this.translate.instant('toast.title_error'));
    } finally {
      this.saveInProgress = false;
    }
  }

  blockChanged() {
    for (const block of this.pluginConfig) {
      block.name = block.config.name || block.name;
    }
  }

  addBlock() {
    // eslint-disable-next-line @typescript-eslint/naming-convention, no-underscore-dangle
    const __uuid__ = uuid();

    this.pluginConfig.push({
      __uuid__,
      name: this.schema.pluginAlias,
      config: {
        [this.pluginType]: this.schema.pluginAlias,
      },
    });

    this.show = __uuid__;
    this.blockChanged();
  }

  removeBlock(__uuid__: string) {
    const pluginConfigIndex = this.pluginConfig.findIndex(x => x.__uuid__ === __uuid__); // eslint-disable-line no-underscore-dangle
    this.pluginConfig.splice(pluginConfigIndex, 1);
  }

  getChildBridges(): any[] {
    try {
      this.$api.get('/status/homebridge/child-bridges').subscribe((data: any[]) => {
        data.forEach((bridge) => {
          if (this.plugin.name === bridge.plugin) {
            this.childBridges.push(bridge);
          }
        });
      });
      return this.childBridges;
    } catch (err) {
      this.$toastr.error(err.message, this.translate.instant('toast.title_error'));
      return [];
    }
  }

  public onRestartHomebridgeClick() {
    this.$router.navigate(['/restart']);
    this.activeModal.close();
  }

  public async onRestartChildBridgeClick() {
    try {
      for (const bridge of this.childBridges) {
        await this.$api.put(`/server/restart/${bridge.username}`, {}).toPromise();
      }
      this.$toastr.success(
        this.translate.instant('plugins.manage.child_bridge_restart_success'),
        this.translate.instant('toast.title_success'),
      );
    } catch (err) {
      this.$notification.configUpdated.next(undefined); // highlight the restart icon in the navbar
      this.$toastr.error(
        this.translate.instant('plugins.manage.child_bridge_restart_failed'),
        this.translate.instant('toast.title_error'),
      );
    } finally {
      this.activeModal.close();
    }
  }

  /**
   * Homebridge Hue - ensure users object is preserved
   */
  homebridgeHueFix(platform: any) {
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

  openFundingModalForUi() {
    try {
      this.$api.get('/plugins').subscribe((plugins) => {
        const ref = this.$modal.open(DonateModalComponent, {
          size: 'lg',
          backdrop: 'static',
        });
        ref.componentInstance.plugin = plugins.find((x) => x.name === 'homebridge-config-ui-x');
      });
    } catch (e) {
      // ignore
    }
  }

  openPluginLogModalForUi() {
    try {
      this.$api.get('/plugins').subscribe((plugins) => {
        const ref = this.$modal.open(PluginLogModalComponent, {
          size: 'xl',
          backdrop: 'static',
        });

        ref.componentInstance.plugin = plugins.find((x) => x.name === 'homebridge-config-ui-x');
      });
    } catch (e) {
      // ignore
    }
  }
}
