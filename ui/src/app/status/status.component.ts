import { Component, OnInit } from '@angular/core';
import { ToastsManager } from 'ng2-toastr/ng2-toastr';

import { WsService } from '../_services/ws.service';
import { ApiService } from '../_services/api.service';
import { PluginService } from '../_services/plugin.service';

@Component({
  selector: 'app-status',
  templateUrl: './status.component.html'
})
export class StatusComponent implements OnInit {
  private onOpen;
  private onMessage;
  private onClose;
  public stats: any = {};
  public server: any = {};
  public homebridge: any = {};
  public homebridgeStatus;
  public consoleStatus;

  constructor(
    private ws: WsService,
    private $plugin: PluginService,
    private $api: ApiService,
    public toastr: ToastsManager,
    ) {}

  ngOnInit() {
    // subscribe to status events
    if (this.ws.socket.readyState) {
      this.ws.subscribe('status');
      this.consoleStatus = 'up';
    }

    this.onOpen = this.ws.open.subscribe(() => {
      this.ws.subscribe('status');
      this.consoleStatus = 'up';
    });

    this.onMessage = this.ws.message.subscribe((data) => {
      try {
        data = JSON.parse(data.data);
        if (data.stats) {
          this.stats = data.stats;
        }
        if (data.status) {
          this.homebridgeStatus = data.status;
        }
      } catch (e) { }
    });

    this.onClose = this.ws.close.subscribe(() => {
      this.consoleStatus = 'down';
      this.homebridgeStatus = 'down';
    });

    // load server information
    this.$api.getServerInfo().subscribe(
      data => this.server = data,
      err => this.toastr.error(`Could not load Homebridge status: ${err.message}`, 'Error')
    );

    this.$api.getHomebridgePackage().subscribe(
      data => this.homebridge = data
    );
  }

  // tslint:disable-next-line:use-life-cycle-interface
  ngOnDestroy() {
    try {
      // unsubscribe from log events
      this.ws.unsubscribe('status');

      // unsubscribe listeners
      this.onOpen.unsubscribe();
      this.onClose.unsubscribe();
      this.onMessage.unsubscribe();
    } catch (e) { }
  }

}

export const StatusStates = {
  name: 'status',
  url: '/',
  component: StatusComponent,
  data: {
    requiresAuth: true
  }
};

