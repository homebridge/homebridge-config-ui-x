import { Component, OnInit, Input, OnDestroy } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { StateService } from '@uirouter/angular';
import { ToastrService } from 'ngx-toastr';
import { Terminal } from 'xterm';
import * as fit from 'xterm/lib/addons/fit/fit';

import { ApiService } from '../_services/api.service';
import { WsService } from '../_services/ws.service';

Terminal.applyAddon(fit);

@Component({
  selector: 'app-plugins-manage',
  templateUrl: './plugins.manage.component.html',
  styleUrls: ['./plugins.component.scss']
})
export class PluginsManageComponent implements OnInit, OnDestroy {
  @Input() pluginName;
  @Input() action;

  private io = this.$ws.connectToNamespace('plugins');

  private term = new Terminal();
  private termTarget: HTMLElement;

  public actionComplete = false;
  public updateSelf = false;
  public changeLog: string;

  private toastSuccess: string;
  public presentTenseVerb: string;
  public pastTenseVerb: string;

  constructor(
    public activeModal: NgbActiveModal,
    public toastr: ToastrService,
    private translate: TranslateService,
    private $api: ApiService,
    private $ws: WsService,
    private $state: StateService,
  ) { }

  ngOnInit() {
    this.termTarget = document.getElementById('plugin-log-output');
    this.term.open(this.termTarget);
    (<any>this.term).fit();

    this.io.socket.on('stdout', (data) => {
      this.term.write(data);
    });

    this.toastSuccess = this.translate.instant('toast.title_success');

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
        this.update();
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
        this.$state.go('plugins');
        this.activeModal.close();
        this.toastr.success(`${this.pastTenseVerb} ${this.pluginName}`, this.toastSuccess);
      },
      (err) => {
        console.error(`Failed to install ${this.pluginName}`);
        this.$state.reload();
      }
    );
  }

  uninstall() {
    this.io.request('uninstall', this.pluginName).subscribe(
      (data) => {
        this.$state.reload();
        this.activeModal.close();
        this.toastr.success(`${this.pastTenseVerb} ${this.pluginName}`, this.toastSuccess);
      },
      (err) => {
        console.error(`Failed to uninstall ${this.pluginName}`);
        this.$state.reload();
      }
    );
  }

  update() {
    this.io.request('update', this.pluginName).subscribe(
      (data) => {
        if (this.pluginName === 'homebridge-config-ui-x') {
          this.updateSelf = true;
        } else {
          this.$state.reload();
        }
        this.toastr.success(`${this.pastTenseVerb} ${this.pluginName}`, this.toastSuccess);
        this.getChangeLog();
      },
      (err) => {
        this.$state.reload();
      }
    );
  }

  upgradeHomebridge() {
    this.io.request('homebridge-update').subscribe(
      (data) => {
        this.$state.go('restart');
        this.activeModal.close();
        this.toastr.success(this.pastTenseVerb, this.toastSuccess);
      },
      (err) => {
        this.toastr.error(err.message);
        this.$state.reload();
      }
    );
  }

  getChangeLog() {
    this.$api.getPluginChangeLog(this.pluginName).subscribe(
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
      }
    );
  }

  public onRestartHomebridgeClick() {
    this.$state.go('restart');
    this.activeModal.close();
  }

  ngOnDestroy() {
    this.io.socket.disconnect();
    this.io.socket.removeAllListeners();
  }

}
