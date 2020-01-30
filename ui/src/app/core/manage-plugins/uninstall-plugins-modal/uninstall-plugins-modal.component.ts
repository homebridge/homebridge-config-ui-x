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
  @Input() pluginName;
  @Input() action;
  @Input() settingsSchema;

  public removeConfig = false;

  constructor(
    private modalService: NgbModal,
    public activeModal: NgbActiveModal,
    private translate: TranslateService,
    private $toastr: ToastrService,
    private $api: ApiService,
  ) { }

  ngOnInit() {
    if (this.settingsSchema) {
      this.removeConfig = true;
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
    ref.componentInstance.pluginName = this.pluginName;
  }

  async removePluginConfig() {
    const configSchema = await this.$api.get(`/plugins/config-schema/${encodeURIComponent(this.pluginName)}`).toPromise();
    const homebridgeConfig = await this.$api.get('/config-editor').toPromise();

    if (!Array.isArray(homebridgeConfig.platforms)) {
      homebridgeConfig.platforms = [];
    }

    if (!Array.isArray(homebridgeConfig.accessories)) {
      homebridgeConfig.accessories = [];
    }

    if (configSchema.pluginType === 'platform') {
      homebridgeConfig.platforms = homebridgeConfig.platforms.filter((platform) => {
        return !(
          platform.platform === configSchema.pluginAlias ||
          platform.platform === this.pluginName + '.' + configSchema.pluginAlias
        );
      });
    }

    if (configSchema.pluginType === 'accessory') {
      homebridgeConfig.accessories = homebridgeConfig.accessories.filter((accessory) => {
        return !(
          accessory.accessory === configSchema.pluginAlias ||
          accessory.accessory === this.pluginName + '.' + configSchema.pluginAlias
        );
      });
    }

    await this.$api.post('/config-editor', homebridgeConfig).toPromise();

    this.$toastr.success(
      this.translate.instant('plugins.settings.toast_plugin_config_saved'),
    );
  }

}
