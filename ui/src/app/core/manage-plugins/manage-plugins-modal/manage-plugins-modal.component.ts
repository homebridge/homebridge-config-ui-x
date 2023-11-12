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
  @Input() pluginName: string;
  @Input() targetVersion = 'latest';
  @Input() action: string;

  private io = this.$ws.connectToNamespace('plugins');

  private term = new Terminal();
  private termTarget: HTMLElement;
  private fitAddon = new FitAddon();

  public actionComplete = false;
  public actionFailed = false;
  public showReleaseNotes = false;
  public justUpdatedPlugin = false;
  public updateToBeta = false;
  public changeLog: string;
  public childBridges: any[] = [];
  public release: any;

  private toastSuccess: string;
  public presentTenseVerb: string;
  public pastTenseVerb: string;

  public onlineUpdateOk: boolean;

  constructor(
    public activeModal: NgbActiveModal,
    public $toastr: ToastrService,
    private $translate: TranslateService,
    public $settings: SettingsService,
    private $api: ApiService,
    private $ws: WsService,
    private $notification: NotificationService,
    private $router: Router,
  ) {
    this.term.loadAddon(this.fitAddon);
  }

  ngOnInit() {
    this.termTarget = document.getElementById('plugin-log-output');
    this.term.open(this.termTarget);
    this.fitAddon.fit();

    this.io.socket.on('stdout', (data: string | Uint8Array) => {
      this.term.write(data);
    });

    this.toastSuccess = this.$translate.instant('toast.title_success');

    this.onlineUpdateOk = !(['homebridge', 'homebridge-config-ui-x'].includes(this.pluginName) && this.$settings.env.platform === 'win32');

    switch (this.action) {
      case 'Install':
        this.install();
        this.presentTenseVerb = this.$translate.instant('plugins.manage.label_install');
        this.pastTenseVerb = this.$translate.instant('plugins.manage.label_installed');
        break;
      case 'Uninstall':
        this.uninstall();
        this.presentTenseVerb = this.$translate.instant('plugins.manage.label_uninstall');
        this.pastTenseVerb = this.$translate.instant('plugins.manage.label_uninstalled');
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
        this.presentTenseVerb = this.$translate.instant('plugins.manage.label_update');
        this.pastTenseVerb = this.$translate.instant('plugins.manage.label_updated');
        break;
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
      () => {
        this.$router.navigate(['/plugins'], {
          queryParams: { installed: this.pluginName },
        });
        this.activeModal.close();
        this.$toastr.success(`${this.pastTenseVerb} ${this.pluginName}`, this.toastSuccess);
      },
      (err) => {
        this.actionFailed = true;
        this.$router.navigate(['/plugins']);
        this.$toastr.error(err.message, this.$translate.instant('toast.title_error'));
      },
    );
  }

  uninstall() {
    this.io.request('uninstall', {
      name: this.pluginName,
      termCols: this.term.cols,
      termRows: this.term.rows,
    }).subscribe(
      () => {
        this.activeModal.close();
        this.$router.navigate(['/plugins']);
        this.$toastr.success(`${this.pastTenseVerb} ${this.pluginName}`, this.toastSuccess);
      },
      (err) => {
        this.actionFailed = true;
        this.$toastr.error(err.message, this.$translate.instant('toast.title_error'));
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
      () => {
        this.justUpdatedPlugin = true;
        this.$router.navigate(['/plugins']);
        this.$toastr.success(`${this.pastTenseVerb} ${this.pluginName}`, this.toastSuccess);
        this.getChangeLog();
        this.getChildBridges();
      },
      (err) => {
        this.actionFailed = true;
        this.$toastr.error(err.message, this.$translate.instant('toast.title_error'));
      },
    );
  }

  upgradeHomebridge() {
    this.io.request('homebridge-update', {
      version: this.targetVersion,
      termCols: this.term.cols,
      termRows: this.term.rows,
    }).subscribe(
      () => {
        this.$router.navigate(['/restart']);
        this.activeModal.close();
        this.$toastr.success(this.pastTenseVerb, this.toastSuccess);
      },
      (err) => {
        this.actionFailed = true;
        this.$toastr.error(err.message, this.$translate.instant('toast.title_error'));
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
      () => {
        this.activeModal.close();
      },
    );
  }

  getChildBridges(): any[] {
    try {
      this.$api.get('/status/homebridge/child-bridges').subscribe((data: any[]) => {
        data.forEach((bridge) => {
          if (this.pluginName === bridge.plugin) {
            this.childBridges.push(bridge);
          }
        });
      });
      return this.childBridges;
    } catch (err) {
      this.$toastr.error(err.message, this.$translate.instant('toast.title_error'));
      return [];
    }
  }

  getReleaseNotes() {
    this.$api.get(`/plugins/release/${encodeURIComponent(this.pluginName)}`).subscribe(
      (data) => {
        this.showReleaseNotes = true;
        this.release = data;
      },
      () => {
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

  public async onRestartChildBridgeClick() {
    try {
      for (const bridge of this.childBridges) {
        await this.$api.put(`/server/restart/${bridge.username}`, {}).toPromise();
      }
      this.$toastr.success(
        this.$translate.instant('plugins.manage.child_bridge_restart_success'),
        this.$translate.instant('toast.title_success'),
      );
    } catch (err) {
      this.$notification.configUpdated.next(undefined); // highlight the restart icon in the navbar
      this.$toastr.error(
        this.$translate.instant('plugins.manage.child_bridge_restart_failed'),
        this.$translate.instant('toast.title_error'),
      );
    } finally {
      this.activeModal.close();
    }
  }

  ngOnDestroy() {
    this.io.end();
  }
}
