import { Component, Input, OnInit } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import { gt } from 'semver';

import { SettingsService } from '@/app/core/settings.service';
import { ApiService } from '@/app/core/api.service';
import { WsService } from '@/app/core/ws.service';
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

  private io = this.$ws.getExistingNamespace('child-bridges');

  public canDisablePlugins = false;
  public canManageBridgeSettings = false;

  public isMobile = this.$md.detect.mobile();

  private _childBridges = [];
  public hasChildBridges = false;
  public hasUnpairedChildBridges = false;
  public allChildBridgesStopped = false;
  public childBridgeStatus = 'pending';
  public childBridgeRestartInProgress = false;
  public canStopStartChildBridges = false;

  constructor(
    public $plugin: ManagePluginsService,
    private $settings: SettingsService,
    private $api: ApiService,
    private $ws: WsService,
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

    // check if the homebridge version supports stopping / starting child bridges
    this.canStopStartChildBridges = this.$settings.env.homebridgeVersion ?
      gt(this.$settings.env.homebridgeVersion, '1.5.0-beta.1', { includePrerelease: true }) : false;
  }

  @Input() set childBridges(childBridges) {
    this.hasChildBridges = childBridges.length > 0;
    this.hasUnpairedChildBridges = childBridges.filter(x => x.paired === false).length > 0;
    this.allChildBridgesStopped = childBridges.filter(x => x.manuallyStopped === true).length === childBridges.length;

    if (this.hasChildBridges) {
      // get the "worse" status of all child bridges and use that for colour icon
      if (childBridges.some(x => x.status === 'down')) {
        this.childBridgeStatus = 'down';
      } else if (childBridges.some(x => x.status === 'pending')) {
        this.childBridgeStatus = 'pending';
      } else if (childBridges.some(x => x.status === 'ok')) {
        this.childBridgeStatus = 'ok';
      }
    }

    this._childBridges = childBridges;
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
        // mark as disabled
        plugin.disabled = true;
        // stop all child bridges
        if (this.hasChildBridges && this.canStopStartChildBridges) {
          this.doChildBridgeAction('stop');
        }
        this.$toastr.success(
          this.$translate.instant('plugins.settings.toast_restart_required'),
          this.$translate.instant('toast.title_success'),
        );
        this.$notification.configUpdated.next(undefined);
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
        // mark as enabled
        plugin.disabled = false;
        // start all child bridges
        if (this.hasChildBridges && this.canStopStartChildBridges) {
          this.doChildBridgeAction('start');
        }
        this.$toastr.success(
          this.$translate.instant('plugins.settings.toast_restart_required'),
          this.$translate.instant('toast.title_success'),
        );
        this.$notification.configUpdated.next(undefined);
      } catch (err) {
        this.$toastr.error(`Failed to enable plugin: ${err.message}`, this.$translate.instant('toast.title_error'));
      }
    }).finally(() => {
      //
    });
  }

  async doChildBridgeAction(action: 'stop' | 'start' | 'restart') {
    this.childBridgeRestartInProgress = true;
    try {
      for (const bridge of this._childBridges) {
        await this.io.request(action + '-child-bridge', bridge.username).toPromise();
      }
    } catch (err) {
      this.$toastr.error(
        `Failed to ${action} bridges: ` + err?.message,
        this.$translate.instant('toast.title_error'),
      );
      this.childBridgeRestartInProgress = false;
    } finally {

      setTimeout(() => {
        this.childBridgeRestartInProgress = false;
      }, action === 'restart' ? 12000 : action === 'stop' ? 6000 : 1000);
    }
  }
}
