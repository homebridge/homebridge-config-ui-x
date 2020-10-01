import { Component, OnInit, Input } from '@angular/core';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';

import { ApiService } from '../../api.service';
import { ManagePluginsModalComponent } from '../manage-plugins-modal/manage-plugins-modal.component';

@Component({
  selector: 'app-uninstall-plugins-modal',
  templateUrl: './uninstall-plugins-modal.component.html',
  styleUrls: ['./uninstall-plugins-modal.component.scss'],
})
export class UninstallPluginsModalComponent implements OnInit {
  @Input() plugin;
  @Input() action;

  public loading = true;
  public removeConfig = false;

  public pluginType: 'platform' | 'accessory';
  public pluginAlias: string;

  constructor(
    private modalService: NgbModal,
    public activeModal: NgbActiveModal,
    private translate: TranslateService,
    private $toastr: ToastrService,
    private $api: ApiService,
  ) { }

  async ngOnInit() {
    try {
      const schema = this.plugin.settingsSchema ? await this.getSchema() : await this.getAlias();
      this.pluginType = schema.pluginType;
      this.pluginAlias = schema.pluginAlias;
    } finally {
      this.loading = false;
    }
  }

  async doUninstall() {
    if (this.removeConfig) {
      try {
        await this.removePluginConfig();
      } catch (e) {
        console.error(e);
        this.$toastr.error('Failed to remove plugin config.', this.translate.instant('toast.title_error'));
      }
    }

    this.activeModal.dismiss();

    const ref = this.modalService.open(ManagePluginsModalComponent, {
      size: 'lg',
      backdrop: 'static',
    });
    ref.componentInstance.action = 'Uninstall';
    ref.componentInstance.pluginName = this.plugin.name;
  }

  async getSchema() {
    return await this.$api.get(`/plugins/config-schema/${encodeURIComponent(this.plugin.name)}`).toPromise();
  }

  async getAlias() {
    return await this.$api.get(`/plugins/alias/${encodeURIComponent(this.plugin.name)}`).toPromise();
  }

  async removePluginConfig() {
    const homebridgeConfig = await this.$api.get('/config-editor').toPromise();

    if (!Array.isArray(homebridgeConfig.platforms)) {
      homebridgeConfig.platforms = [];
    }

    if (!Array.isArray(homebridgeConfig.accessories)) {
      homebridgeConfig.accessories = [];
    }

    if (this.pluginType === 'platform') {
      homebridgeConfig.platforms = homebridgeConfig.platforms.filter((platform) => {
        return !(
          platform.platform === this.pluginAlias ||
          platform.platform === this.plugin.name + '.' + this.pluginAlias
        );
      });
    }

    if (this.pluginType === 'accessory') {
      homebridgeConfig.accessories = homebridgeConfig.accessories.filter((accessory) => {
        return !(
          accessory.accessory === this.pluginAlias ||
          accessory.accessory === this.plugin.name + '.' + this.pluginAlias
        );
      });
    }

    await this.$api.post('/config-editor', homebridgeConfig).toPromise();

    this.$toastr.success(
      this.translate.instant('plugins.settings.toast_plugin_config_saved'),
    );
  }

}
