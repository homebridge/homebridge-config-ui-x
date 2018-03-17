import { Component, OnInit } from '@angular/core';
import { TimerObservable } from 'rxjs/observable/TimerObservable';
import { StateService } from '@uirouter/angular';
import { ToastsManager } from 'ng2-toastr/ng2-toastr';

import { ApiService } from '../../../_services/api.service';
import { WsService } from '../../../_services/ws.service';

@Component({
  selector: 'app-restart-server',
  templateUrl: './shutdown-server.component.html'
})
export class ShutdownServerComponent implements OnInit {
  onOpen;
  onMessage;
  checkDelay;
  resp: any = {};
  timeout = false;
  error: any = false;

  constructor(
    private $api: ApiService,
    private ws: WsService,
    public toastr: ToastsManager,
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

    this.$api.linuxShutdownServer().subscribe(
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
    this.checkDelay = TimerObservable.create(60000).subscribe(() => {
      this.onMessage = this.ws.handlers.server.subscribe((data) => {
        if (data.status === 'up') {
          this.toastr.success('Server Restarted', 'Success');
          this.$state.go('status');
        }
      });
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
  }

}

export const ShutdownServerState = {
  name: 'linux.shutdown-server',
  url: '/shutdown',
  views: {
    '!$default': { component: ShutdownServerComponent }
  },
  data: {
    requiresAuth: true,
    requiresAdmin: true
  }
};
