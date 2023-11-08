import { Component, OnInit, Input, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';

import { ApiService } from '@/app/core/api.service';
import { SettingsService } from '@/app/core/settings.service';
import { WsService } from '@/app/core/ws.service';
import { NotificationService } from '@/app/core/notification.service';

@Component({
  selector: 'app-manage-plugins-modal',
  templateUrl: './manage-plugins-modal.component.html',
  styleUrls: ['./manage-plugins-modal.component.scss'],
})
export class ManagePluginsModalComponent implements OnInit, OnDestroy {
  @Input() pluginName;
  @Input() targetVersion = 'latest';
  @Input() action;
  @Input() plugin;

  private io = this.$ws.connectToNamespace('plugins');

  public canConfigure = true;
  public configBlocks: any[] = [];
  public enabledBlocks: Record<number, boolean> = {};
  public usernameCache: Map<number, string> = new Map();
  public deviceInfo: Map<string, any> = new Map();

  private term = new Terminal();
  private termTarget: HTMLElement;
  private fitAddon = new FitAddon();

  public actionComplete = false;
  public actionFailed = false;
  public showReleaseNotes = false;
  public justUpdatedPlugin = false;
  public updateToBeta = false;
  public restartInProgress: Record<string, boolean> = {};
  public changeLog: string;
  public release;

  private toastSuccess: string;
  public presentTenseVerb: string;
  public pastTenseVerb: string;

  public onlineUpdateOk: boolean;

  constructor(
    public activeModal: NgbActiveModal,
    public $toastr: ToastrService,
    private translate: TranslateService,
    private $translate: TranslateService,
    private $settings: SettingsService,
    private $api: ApiService,
    private $ws: WsService,
    private $notification: NotificationService,
    private $router: Router,
  ) {
    this.term.loadAddon(this.fitAddon);
  }

  ngOnInit(): void {
    this.loadPluginConfig();
    this.termTarget = document.getElementById('plugin-log-output');
    this.term.open(this.termTarget);
    this.fitAddon.fit();

    this.io.socket.on('stdout', (data) => {
      this.term.write(data);
    });

    this.toastSuccess = this.translate.instant('toast.title_success');

    this.onlineUpdateOk = !(['homebridge', 'homebridge-config-ui-x'].includes(this.pluginName) && this.$settings.env.platform === 'win32');

    switch (this.action) {
      case 'Install':
        this.install();
        this.presentTenseVerb = this.translate.instant('plugins.manage.label_install');
        this.pastTenseVerb = this.translate.instant('plugins.manage.label_installed');
        break;
      case 'Uninstall':
        this.uninstall();
        this.presentTenseVerb = this.translate.instant('plugins.manage.label_uninstall');
        this.pastTenseVerb = this.translate.instant('plugins.manage.label_uninstalled');
        break;
      case 'Update':
        switch (this.targetVersion) {
          case 'latest':
            this.updateToBeta = false;
            this.getReleaseNotes();
            break;
          case 'beta':
            this.updateToBeta = true;
            this.getReleaseNotes();
            break;
          default:
            this.update();
        }
        this.presentTenseVerb = this.translate.instant('plugins.manage.label_update');
        this.pastTenseVerb = this.translate.instant('plugins.manage.label_updated');
        break;
    }
  }

  loadPluginConfig() {
    this.$api.get(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}`).subscribe(
      (configBlocks) => {
        this.configBlocks = configBlocks;
        for (const [i, block] of this.configBlocks.entries()) {
          if (block._bridge && block._bridge.username) {
            this.enabledBlocks[i] = true;
            this.usernameCache.set(i, block._bridge.username);
            this.getDeviceInfo(block._bridge.username);
          }
        }
      },
      (err) => {
        this.canConfigure = false;
      },
    );
  }

  async getDeviceInfo(username: string) {
    try {
      this.deviceInfo[username] = await this.$api.get(`/server/pairings/${username.replace(/:/g, '')}`).toPromise();
    } catch (e) {
      this.deviceInfo[username] = false;
    }
  }

  install() {
    if (!this.onlineUpdateOk) {
      return;
    }

    if (this.pluginName === 'homebridge') {
      return this.upgradeHomebridge();
    }

    this.io.request('install', {
      name: this.pluginName,
      version: this.targetVersion,
      termCols: this.term.cols,
      termRows: this.term.rows,
    }).subscribe(
      (data) => {
        this.$router.navigate(['/plugins'], {
          queryParams: { installed: this.pluginName },
        });
        this.activeModal.close();
        this.$toastr.success(`${this.pastTenseVerb} ${this.pluginName}`, this.toastSuccess);
      },
      (err) => {
        this.actionFailed = true;
        this.$router.navigate(['/plugins']);
        this.$toastr.error(err.message, this.translate.instant('toast.title_error'));
      },
    );
  }

  uninstall() {
    this.io.request('uninstall', {
      name: this.pluginName,
      termCols: this.term.cols,
      termRows: this.term.rows,
    }).subscribe(
      (data) => {
        this.activeModal.close();
        this.$router.navigate(['/plugins']);
        this.$toastr.success(`${this.pastTenseVerb} ${this.pluginName}`, this.toastSuccess);
      },
      (err) => {
        this.actionFailed = true;
        this.$toastr.error(err.message, this.translate.instant('toast.title_error'));
      },
    );
  }

  update() {
    // hide the release notes
    this.showReleaseNotes = false;

    if (!this.onlineUpdateOk) {
      return;
    }

    // if this is updating homebridge, use an alternative workflow
    if (this.pluginName === 'homebridge') {
      return this.upgradeHomebridge();
    }

    this.io.request('update', {
      name: this.pluginName,
      version: this.targetVersion,
      termCols: this.term.cols,
      termRows: this.term.rows,
    }).subscribe(
      (data) => {
        this.justUpdatedPlugin = true;
        this.$router.navigate(['/plugins']);
        this.$toastr.success(`${this.pastTenseVerb} ${this.pluginName}`, this.toastSuccess);
        this.getChangeLog();
        this.$notification.configUpdated.next(undefined);
      },
      (err) => {
        this.actionFailed = true;
        this.$toastr.error(err.message, this.translate.instant('toast.title_error'));
      },
    );
  }

  async restartChildBridge(username: string) {
    this.restartInProgress[username] = true;
    try {
      await this.$api.put(`/server/restart/${username.replace(/:/g, '')}`, {}).toPromise();
      this.$toastr.success(
        this.$translate.instant('child_bridge.toast_restart_requested'),
        this.$translate.instant('toast.title_success'),
      );
    } catch (err) {
      this.$toastr.error(
        'Failed to restart bridge: ' + err.error?.message,
        this.$translate.instant('toast.title_error'),
      );
      this.restartInProgress[username] = false;
    } finally {
      setTimeout(() => {
        this.restartInProgress[username] = false;
      }, 12000);
    }
  }

  upgradeHomebridge() {
    this.io.request('homebridge-update', {
      version: this.targetVersion,
      termCols: this.term.cols,
      termRows: this.term.rows,
    }).subscribe(
      (data) => {
        this.$router.navigate(['/restart']);
        this.activeModal.close();
        this.$toastr.success(this.pastTenseVerb, this.toastSuccess);
      },
      (err) => {
        this.actionFailed = true;
        this.$toastr.error(err.message, this.translate.instant('toast.title_error'));
      },
    );
  }

  getChangeLog() {
    this.$api.get(`/plugins/changelog/${encodeURIComponent(this.pluginName)}`).subscribe(
      (data: { changelog: string }) => {
        if (data.changelog) {
          this.actionComplete = true;
          this.changeLog = data.changelog;
        } else {
          this.activeModal.close();
        }
      },
      (err) => {
        this.activeModal.close();
      },
    );
  }

  getReleaseNotes() {
    this.$api.get(`/plugins/release/${encodeURIComponent(this.pluginName)}`).subscribe(
      (data) => {
        this.showReleaseNotes = true;
        this.release = data;
      },
      (err) => {
        if (this.onlineUpdateOk) {
          this.update();
        }
      },
    );
  }

  public onRestartHomebridgeClick() {
    this.$router.navigate(['/restart']);
    this.activeModal.close();
  }

  ngOnDestroy() {
    this.io.end();
  }

}
