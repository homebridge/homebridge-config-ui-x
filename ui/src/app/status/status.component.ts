import { Component, OnInit } from '@angular/core';

import { WsService } from '../_services/ws.service';
import { ApiService } from '../_services/api.service';

@Component({
  selector: 'app-status',
  templateUrl: './status.component.html'
})
class StatusComponent implements OnInit {
  private ws;

  public server: any = {};

  public homebridge: any = {};

  public stats: any = {
    memory: {
      total: 0,
      used: 0,
      free: 0
    },
    uptime: {
      days: 0,
      hours: 0,
      minutes: 0
    },
    cpu: 0,
    cputemp: '0.00'
  };

  constructor(private wsService: WsService, private $api: ApiService) {
    this.ws = wsService.ws;
  }

  ngOnInit() {
    // subscribe to status events
    if (this.ws.readyState) {
      this.ws.send('status-sub');
    } else {
      this.ws.onopen = () => {
        this.ws.send('status-sub');
      };
    }

    this.ws.onmessage = (data) => {
      try {
        data = JSON.parse(data.data);
        if (data.stats) {
          this.stats = data.stats;
        }
      } catch (e) { }
    };

    // load server information
    this.$api.getServerInfo().subscribe(
      data => this.server = data
    );

    this.$api.getHomebridgePlugin().subscribe(
      data => this.homebridge = data
    );
  }

  // tslint:disable-next-line:use-life-cycle-interface
  ngOnDestroy() {
    try {
      // unsubscribe from log events
      this.ws.send('status-unsub');
    } catch (e) { }
  }

}

const StatusStates = {
  name: 'status',
  url: '/',
  component: StatusComponent
};

export { StatusStates, StatusComponent };
