import { Component, OnInit, Input, OnDestroy } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';

import { AuthService } from '../../auth/auth.service';
import { ApiService } from '../../api.service';
import { WsService } from '../../ws.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-manage-plugins-modal',
  templateUrl: './manage-plugins-modal.component.html',
  styleUrls: ['./manage-plugins-modal.component.scss'],
})
export class ManagePluginsModalComponent implements OnInit, OnDestroy {
  @Input() pluginName;
  @Input() action;

  private io = this.$ws.connectToNamespace('plugins');

  private term = new Terminal();
  private termTarget: HTMLElement;
  private fitAddon = new FitAddon();

  public actionComplete = false;
  public showReleaseNotes = false;
  public updateSelf = false;
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
    public $auth: AuthService,
    private $api: ApiService,
    private $ws: WsService,
    private $router: Router,
  ) {
    this.term.loadAddon(this.fitAddon);
  }

  ngOnInit() {
    this.termTarget = document.getElementById('plugin-log-output');
    this.term.open(this.termTarget);
    this.fitAddon.fit();

    this.io.socket.on('stdout', (data) => {
      this.term.write(data);
    });

    this.toastSuccess = this.translate.instant('toast.title_success');

    this.onlineUpdateOk = !(['homebridge', 'homebridge-config-ui-x'].includes(this.pluginName) && this.$auth.env.platform === 'win32');

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
        this.getReleaseNotes();
        this.presentTenseVerb = this.translate.instant('plugins.manage.label_update');
        this.pastTenseVerb = this.translate.instant('plugins.manage.label_updated');
        break;
      case 'Upgrade':
        this.upgradeHomebridge();
        this.presentTenseVerb = this.translate.instant('plugins.manage.label_upgrade');
        this.pastTenseVerb = this.translate.instant('plugins.manage.label_homebridge_upgraded');
        break;
    }
  }

  install() {
    this.io.request('install', this.pluginName).subscribe(
      (data) => {
        this.$router.navigate(['/plugins'], {
          queryParams: { installed: this.pluginName },
        });
        this.activeModal.close();
        this.$toastr.success(`${this.pastTenseVerb} ${this.pluginName}`, this.toastSuccess);
      },
      (err) => {
        this.$router.navigate(['/plugins']);
        console.error(`Failed to install ${this.pluginName}`);
      },
    );
  }

  uninstall() {
    this.io.request('uninstall', this.pluginName).subscribe(
      (data) => {
        this.activeModal.close();
        this.$router.navigate(['/plugins']);
        this.$toastr.success(`${this.pastTenseVerb} ${this.pluginName}`, this.toastSuccess);
      },
      (err) => {
        console.error(`Failed to uninstall ${this.pluginName}`);
      },
    );
  }

  update() {
    this.showReleaseNotes = false;
    this.io.request('update', this.pluginName).subscribe(
      (data) => {
        if (this.pluginName === 'homebridge-config-ui-x') {
          this.updateSelf = true;
          if (this.$auth.env.dockerOfflineUpdate) {
            this.$router.navigate(['/platform-tools/docker/restart-container']);
            this.activeModal.close();
            return;
          }
        }
        this.$router.navigate(['/plugins']);
        this.$toastr.success(`${this.pastTenseVerb} ${this.pluginName}`, this.toastSuccess);
        this.getChangeLog();
      },
      (err) => { },
    );
  }

  upgradeHomebridge() {
    this.io.request('homebridge-update').subscribe(
      (data) => {
        this.$router.navigate(['/restart']);
        this.activeModal.close();
        this.$toastr.success(this.pastTenseVerb, this.toastSuccess);
      },
      (err) => {
        this.$toastr.error(err.message);
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
