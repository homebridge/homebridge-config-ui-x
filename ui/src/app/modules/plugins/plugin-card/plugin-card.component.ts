import { Component, Input, OnInit } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import { ApiService } from '@/app/core/api.service';
import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component';
import { InformationComponent } from '@/app/core/components/information/information.component';
import { RestartHomebridgeComponent } from '@/app/core/components/restart-homebridge/restart-homebridge.component';
import { ManagePluginsService } from '@/app/core/manage-plugins/manage-plugins.service';
import { PluginLogModalComponent } from '@/app/core/manage-plugins/plugin-log-modal/plugin-log-modal.component';
import { MobileDetectService } from '@/app/core/mobile-detect.service';
import { SettingsService } from '@/app/core/settings.service';
import { WsService } from '@/app/core/ws.service';
import { DonateModalComponent } from '@/app/modules/plugins/donate-modal/donate-modal.component';

@Component({
  selector: 'app-plugin-card',
  templateUrl: './plugin-card.component.html',
  styleUrls: ['./plugin-card.component.scss'],
})
export class PluginCardComponent implements OnInit {
  @Input() plugin: any;

  public hasChildBridges = false;
  public hasUnpairedChildBridges = false;
  public allChildBridgesStopped = false;
  public childBridgeStatus = 'pending';
  public childBridgeRestartInProgress = false;
  public recommendChildBridge = false;
  public isMobile = this.$md.detect.mobile();

  private io = this.$ws.getExistingNamespace('child-bridges');
  private setChildBridges = [];

  constructor(
    public $plugin: ManagePluginsService,
    private $api: ApiService,
    private $ws: WsService,
    private $translate: TranslateService,
    private $modal: NgbModal,
    private $toastr: ToastrService,
    private $md: MobileDetectService,
    private $settings: SettingsService,
  ) {}

  @Input() set childBridges(childBridges: any[]) {
    this.hasChildBridges = childBridges.length > 0;
    this.hasUnpairedChildBridges = childBridges.filter((x: any) => x.paired === false).length > 0;
    this.allChildBridgesStopped = childBridges.filter((x: any) => x.manuallyStopped === true).length === childBridges.length;

    if (this.hasChildBridges) {
      // get the "worse" status of all child bridges and use that for colour icon
      if (childBridges.some((x: any) => x.status === 'down')) {
        this.childBridgeStatus = 'down';
      } else if (childBridges.some((x: any) => x.status === 'pending')) {
        this.childBridgeStatus = 'pending';
      } else if (childBridges.some((x: any) => x.status === 'ok')) {
        this.childBridgeStatus = 'ok';
      }
    }

    this.setChildBridges = childBridges;
  }

  ngOnInit(): void {
    if (
      !this.$settings.env.recommendChildBridges
      || !this.$settings.env.serviceMode
      || ['homebridge', 'homebridge-config-ui-x'].includes(this.plugin.name)
    ) {
      this.recommendChildBridge = false;
      return;
    }
    this.$api.get(`/plugins/config-schema/${encodeURIComponent(this.plugin.name)}`, {}).toPromise()
      .then((schema) => {
        this.recommendChildBridge = schema.pluginType === 'platform';
      })
      .catch(() => {
        this.recommendChildBridge = false;
      });
  }

  openFundingModal(plugin: any) {
    const ref = this.$modal.open(DonateModalComponent);
    ref.componentInstance.plugin = plugin;
  }

  openVerifiedModal() {
    const ref = this.$modal.open(InformationComponent);
    ref.componentInstance.title = this.$translate.instant('plugins.manage.modal_verified_title');
    ref.componentInstance.message = this.$translate.instant('plugins.manage.modal_verified_message');
    ref.componentInstance.ctaButtonLabel = this.$translate.instant('form.button_more_info');
    ref.componentInstance.ctaButtonLink = 'https://github.com/homebridge/homebridge/wiki/verified-Plugins';
    ref.componentInstance.faIconClass = 'fa-shield-alt green-text';
  }

  disablePlugin(plugin: any) {
    const ref = this.$modal.open(ConfirmComponent);

    ref.componentInstance.title = `${this.$translate.instant('plugins.manage.disable')}: ${plugin.name}`;
    ref.componentInstance.message = this.$translate.instant('plugins.manage.message_confirm_disable', { pluginName: plugin.name });
    ref.componentInstance.confirmButtonLabel = this.$translate.instant('plugins.manage.disable');
    ref.componentInstance.faIconClass = 'fa-circle-pause primary-text';

    ref.result.then(async () => {
      try {
        await this.$api.put(`/config-editor/plugin/${encodeURIComponent(plugin.name)}/disable`, {}).toPromise();
        // mark as disabled
        plugin.disabled = true;
        // stop all child bridges
        if (this.hasChildBridges) {
          this.doChildBridgeAction('stop');
        }
        this.$modal.open(RestartHomebridgeComponent);
      } catch (err) {
        this.$toastr.error(`Failed to disable plugin: ${err.message}`, this.$translate.instant('toast.title_error'));
      }
    }).finally(() => {
      //
    });
  }

  enablePlugin(plugin: any) {
    const ref = this.$modal.open(ConfirmComponent);

    ref.componentInstance.title = `${this.$translate.instant('plugins.manage.enable')}: ${plugin.name}`;
    ref.componentInstance.message = this.$translate.instant('plugins.manage.message_confirm_enable', { pluginName: plugin.name });
    ref.componentInstance.confirmButtonLabel = this.$translate.instant('plugins.manage.enable');
    ref.componentInstance.faIconClass = 'fa-circle-play primary-text';

    ref.result.then(async () => {
      try {
        await this.$api.put(`/config-editor/plugin/${encodeURIComponent(plugin.name)}/enable`, {}).toPromise();
        // mark as enabled
        plugin.disabled = false;
        // start all child bridges
        if (this.hasChildBridges) {
          await this.doChildBridgeAction('start');
        }
        this.$modal.open(RestartHomebridgeComponent);
      } catch (err) {
        this.$toastr.error(`Failed to enable plugin: ${err.message}`, this.$translate.instant('toast.title_error'));
      }
    }).finally(() => {
      //
    });
  }

  viewPluginLog(plugin: any) {
    const ref = this.$modal.open(PluginLogModalComponent, {
      size: 'xl',
      backdrop: 'static',
    });

    ref.componentInstance.plugin = plugin;
  }

  async doChildBridgeAction(action: 'stop' | 'start' | 'restart') {
    this.childBridgeRestartInProgress = true;
    try {
      for (const bridge of this.setChildBridges) {
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
