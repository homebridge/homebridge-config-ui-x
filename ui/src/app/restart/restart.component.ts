import { Component, OnInit } from '@angular/core';
import { TimerObservable } from 'rxjs/observable/TimerObservable';
import { StateService } from '@uirouter/angular';
import { ToastrService } from 'ngx-toastr';

import { ApiService } from '../_services/api.service';
import { WsService } from '../_services/ws.service';

@Component({
  selector: 'app-restart',
  templateUrl: './restart.component.html'
})
export class RestartComponent implements OnInit {
  onOpen;
  onMessage;
  checkTimeout;
  checkDelay;
  resp: any = {};
  timeout = false;
  error: any = false;

  constructor(
    private $api: ApiService,
    private ws: WsService,
    public toastr: ToastrService,
    private $state: StateService,
  ) { }

  ngOnInit() {
    // subscribe to status events
    if (this.ws.socket.readyState) {
      this.ws.subscribe('status');
    }

    this.onOpen = this.ws.open.subscribe(() => {
      this.ws.subscribe('status');
    });

    this.$api.restartServer().subscribe(
      data => {
        this.resp = data;
        this.checkIfServerUp();
      },
      err => {
        this.error = 'An error occured sending the restart command to the server.';
        this.toastr.error(`An error occured sending the restart command to the server: ${err.message}`, 'Error');
      }
    );
  }

  checkIfServerUp() {
    this.checkDelay = TimerObservable.create(3000).subscribe(() => {
      this.onMessage = this.ws.handlers.server.subscribe((data) => {
        if (data.status === 'up') {
          this.toastr.success('Server Restarted', 'Success');
          this.$state.go('status');
        }
      });
    });

    this.checkTimeout = TimerObservable.create(20000).subscribe(() => {
      this.toastr.warning('The server is taking a long time to come back online', 'Warning', {
        timeOut: 10000
      });
      this.timeout = true;
    });
  }

  // tslint:disable-next-line:use-life-cycle-interface
  ngOnDestroy() {
    if (this.onOpen) {
      this.onOpen.unsubscribe();
    }

    if (this.onMessage) {
      this.onMessage.unsubscribe();
    }

    if (this.checkDelay) {
      this.checkDelay.unsubscribe();
    }

    if (this.checkTimeout) {
      this.checkTimeout.unsubscribe();
    }
  }

}

export const RestartState = {
  name: 'restart',
  url: '/restart',
  component: RestartComponent,
  data: {
    requiresAuth: true
  }
};
