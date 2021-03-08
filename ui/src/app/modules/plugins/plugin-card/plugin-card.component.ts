import { Component, Input, OnInit } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import { gt } from 'semver';

import { SettingsService } from '@/app/core/settings.service';
import { ApiService } from '@/app/core/api.service';
import { NotificationService } from '@/app/core/notification.service';
import { ManagePluginsService } from '@/app/core/manage-plugins/manage-plugins.service';
import { MobileDetectService } from '@/app/core/mobile-detect.service';
import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component';
import { DonateModalComponent } from '@/app/modules/plugins/donate-modal/donate-modal.component';

@Component({
  selector: 'app-plugin-card',
  templateUrl: './plugin-card.component.html',
  styleUrls: ['./plugin-card.component.scss'],
})
export class PluginCardComponent implements OnInit {
  @Input() plugin;

  public canDisablePlugins = false;
  public canManageBridgeSettings = false;

  public isMobile = this.$md.detect.mobile();

  constructor(
    public $plugin: ManagePluginsService,
    private $settings: SettingsService,
    private $api: ApiService,
    private $notification: NotificationService,
    private $translate: TranslateService,
    private $modal: NgbModal,
    private $toastr: ToastrService,
    private $md: MobileDetectService,
  ) { }

  ngOnInit(): void {
    // check if the homebridge version supports disabled plugins
    this.canDisablePlugins = this.$settings.env.homebridgeVersion ?
      gt(this.$settings.env.homebridgeVersion, '1.3.0-beta.46', { includePrerelease: true }) : false;

    // check if the homebridge version supports external bridges
    this.canManageBridgeSettings = this.$settings.env.homebridgeVersion ?
      gt(this.$settings.env.homebridgeVersion, '1.3.0-beta.47', { includePrerelease: true }) : false;
  }


  openFundingModal(plugin) {
    const ref = this.$modal.open(DonateModalComponent);
    ref.componentInstance.plugin = plugin;
  }

  disablePlugin(plugin) {
    const ref = this.$modal.open(ConfirmComponent);

    ref.componentInstance.title = `${this.$translate.instant('plugins.manage.disable')}: ${plugin.name}`;
    ref.componentInstance.message = this.$translate.instant('plugins.manage.message_confirm_disable', { pluginName: plugin.name });
    ref.componentInstance.confirmButtonLabel = this.$translate.instant('plugins.manage.disable');
    ref.componentInstance.cancelButtonLabel = this.$translate.instant('form.button_cancel');

    ref.result.then(async () => {
      try {
        await this.$api.put(`/config-editor/plugin/${encodeURIComponent(plugin.name)}/disable`, {}).toPromise();
        plugin.disabled = true;
        this.$toastr.success(
          this.$translate.instant('plugins.settings.toast_restart_required'),
          this.$translate.instant('toast.title_success'),
        );
        this.$notification.configUpdated.next();
      } catch (err) {
        this.$toastr.error(`Failed to disable plugin: ${err.message}`, this.$translate.instant('toast.title_error'));
      }
    }).finally(() => {
      //
    });
  }

  enablePlugin(plugin) {
    const ref = this.$modal.open(ConfirmComponent);

    ref.componentInstance.title = `${this.$translate.instant('plugins.manage.enable')}: ${plugin.name}`;
    ref.componentInstance.message = this.$translate.instant('plugins.manage.message_confirm_enable', { pluginName: plugin.name });
    ref.componentInstance.confirmButtonLabel = this.$translate.instant('plugins.manage.enable');
    ref.componentInstance.cancelButtonLabel = this.$translate.instant('form.button_cancel');

    ref.result.then(async () => {
      try {
        await this.$api.put(`/config-editor/plugin/${encodeURIComponent(plugin.name)}/enable`, {}).toPromise();
        plugin.disabled = false;
        this.$toastr.success(
          this.$translate.instant('plugins.settings.toast_restart_required'),
          this.$translate.instant('toast.title_success'),
        );
        this.$notification.configUpdated.next();
      } catch (err) {
        this.$toastr.error(`Failed to enable plugin: ${err.message}`, this.$translate.instant('toast.title_error'));
      }
    }).finally(() => {
      //
    });
  }


}
