import { Component, OnInit, Input } from '@angular/core';
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
export class PluginsManageComponent implements OnInit {
  @Input() pluginName;
  @Input() action;

  private term = new Terminal();
  private termTarget: HTMLElement;

  private onMessage;
  private onDone;
  private onComplete: Function;

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

    this.onDone = this.ws.handlers.npmInstall.subscribe((data) => {
      if (data.succeeded && data.pkg === this.pluginName) {
        this.onComplete();
      } else if (data.pkg === this.pluginName) {
        this.$state.reload();
      }
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
    this.$api.installPlugin(this.pluginName).subscribe(
      (data) => {
        this.onComplete = () => {
          this.$state.go('plugins');
          this.activeModal.close();
          this.toastr.success(`${this.pastTenseVerb} ${this.pluginName}`, this.toastSuccess);
        };
      },
      (err) => {
        this.$state.reload();
      }
    );
  }

  uninstall() {
    this.$api.uninstallPlugin(this.pluginName).subscribe(
      (data) => {
        this.onComplete = () => {
          this.$state.reload();
          this.activeModal.close();
          this.toastr.success(`${this.pastTenseVerb} ${this.pluginName}`, this.toastSuccess);
        };
      },
      (err) => {
        this.$state.reload();
      }
    );
  }

  update() {
    this.$api.updatePlugin(this.pluginName).subscribe(
      (data) => {
        this.onComplete = () => {
          if (this.pluginName === 'homebridge-config-ui-x') {
            this.updateSelf = true;
          } else {
            this.$state.reload();
          }
          this.toastr.success(`${this.pastTenseVerb} ${this.pluginName}`, this.toastSuccess);
          this.getChangeLog();
        };
      },
      (err) => {
        this.$state.reload();
      }
    );
  }

  upgradeHomebridge() {
    this.$api.upgradeHomebridgePackage().subscribe(
      (data) => {
        this.onComplete = () => {
          this.$state.go('restart');
          this.activeModal.close();
          this.toastr.success(this.pastTenseVerb, this.toastSuccess);
        };
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
      this.onDone.unsubscribe();
    } catch (e) { }
  }

}
