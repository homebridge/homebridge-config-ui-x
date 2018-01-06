import { Component, OnInit, Input } from '@angular/core';
import { NgbModal, NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { StateService } from '@uirouter/angular';

import { ToastsManager } from 'ng2-toastr/ng2-toastr';

import { ApiService } from '../_services/api.service';
import { WsService } from '../_services/ws.service';

@Component({
  selector: 'app-plugins-manage',
  templateUrl: './plugins.manage.component.html'
})
export class PluginsManageComponent implements OnInit {
  @Input() pluginName;
  @Input() action;
  private ws;
  private term = new (<any>window).Terminal();

  constructor(
    public activeModal: NgbActiveModal,
    public toastr: ToastsManager,
    private $api: ApiService,
    private wsService: WsService,
    private $state: StateService,
  ) {
    this.ws = wsService.ws;
  }

  ngOnInit() {
    this.term.open(document.getElementById('plugin-log-output'), { focus: true, cursorBlink: true});
    this.term.fit();

    this.ws.onmessage = (data) => {
      try {
        data = JSON.parse(data.data);
        if (data.npmLog) {
          this.term.write(data.npmLog);
        }
      } catch (e) { }
    };

    switch (this.action) {
      case 'Install':
        this.$api.installPlugin(this.pluginName).subscribe(
          (data) => {
            this.$state.go('plugins');
            this.activeModal.close();
            this.toastr.success(`Installed ${this.pluginName}`, 'Success!');
          }
        );
        break;
      case 'Uninstall':
        this.$api.uninstallPlugin(this.pluginName).subscribe(
          (data) => {
            this.$state.reload();
            this.activeModal.close();
            this.toastr.success(`Removed ${this.pluginName}`, 'Success!');
          }
        );
        break;
      case 'Update':
        this.$api.updatePlugin(this.pluginName).subscribe(
          (data) => {
            this.$state.reload();
            this.activeModal.close();
            this.toastr.success(`Updated ${this.pluginName}`, 'Success!');
          }
        );
        break;
    }

  }

}
