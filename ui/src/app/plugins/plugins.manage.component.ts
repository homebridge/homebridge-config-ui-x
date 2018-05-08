import { Component, OnInit, Input } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { StateService } from '@uirouter/angular';
import { ToastsManager } from 'ng2-toastr/ng2-toastr';
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
export class PluginsManageComponent implements OnInit {
  @Input() pluginName;
  @Input() action;

  private term = new Terminal();
  private termTarget: HTMLElement;

  private onMessage;

  public actionComplete = false;
  public updateSelf = false;
  public changeLog: string;

  constructor(
    public activeModal: NgbActiveModal,
    public toastr: ToastsManager,
    private $api: ApiService,
    private ws: WsService,
    private $state: StateService,
  ) {}

  ngOnInit() {
    this.termTarget = document.getElementById('plugin-log-output');
    this.term.open(this.termTarget);
    (<any>this.term).fit();

    this.onMessage = this.ws.handlers.npmLog.subscribe((data) => {
      this.term.write(data);
    });

    switch (this.action) {
      case 'Install':
        this.install();
        break;
      case 'Uninstall':
        this.uninstall();
        break;
      case 'Update':
        this.update();
        break;
      case 'Upgrade':
        this.upgradeHomebridge();
        break;
    }
  }

  install() {
    this.$api.installPlugin(this.pluginName).subscribe(
      (data) => {
        this.$state.go('plugins');
        this.activeModal.close();
        this.toastr.success(`Installed ${this.pluginName}`, 'Success!');
      },
      (err) => {
        this.$state.reload();
      }
    );
  }

  uninstall() {
    this.$api.uninstallPlugin(this.pluginName).subscribe(
      (data) => {
        this.$state.reload();
        this.activeModal.close();
        this.toastr.success(`Removed ${this.pluginName}`, 'Success!');
      },
      (err) => {
        this.$state.reload();
      }
    );
  }

  update() {
    this.$api.updatePlugin(this.pluginName).subscribe(
      (data) => {
        if (this.pluginName === 'homebridge-config-ui-x') {
          this.updateSelf = true;
        } else {
          this.$state.reload();
        }
        this.toastr.success(`Updated ${this.pluginName}`, 'Success!');
        this.getChangeLog();
      },
      (err) => {
        this.$state.reload();
      }
    );
  }

  upgradeHomebridge() {
    this.$api.upgradeHomebridgePackage().subscribe(
      (data) => {
        this.$state.go('restart');
        this.activeModal.close();
        this.toastr.success(`Homebridge Upgraded`, 'Success!');
      },
      (err) => {
        this.$state.reload();
      }
    );
  }

  getChangeLog() {
    this.$api.getPluginChangeLog(this.pluginName).subscribe(
      (data: {changelog: string}) => {
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


  // tslint:disable-next-line:use-life-cycle-interface
  ngOnDestroy() {
    try {
      this.onMessage.unsubscribe();
    } catch (e) { }
  }

}
