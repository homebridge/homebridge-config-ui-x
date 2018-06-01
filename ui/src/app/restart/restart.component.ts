import { Component, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
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
    private translate: TranslateService,
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
      async err => {
        const toastError = await this.translate.get('toast.title_error').toPromise();
        const toastRestartError = await this.translate.get('restart.toast_server_restart_error').toPromise();
        this.error = toastRestartError + '.';
        this.toastr.error(`${toastRestartError}: ${err.message}`, toastError);
      }
    );
  }

  async checkIfServerUp() {
    const toastWarning = await this.translate.get('toast.title_warning').toPromise();
    const toastSuccess = await this.translate.get('toast.title_success').toPromise();
    const toastServerRestarted = await this.translate.get('restart.toast_server_restarted').toPromise();
    const toastServerRestartTimeout = await this.translate.get('restart.toast_sever_restart_timeout').toPromise();

    this.checkDelay = TimerObservable.create(3000).subscribe(() => {
      this.onMessage = this.ws.handlers.server.subscribe((data) => {
        if (data.status === 'up') {
          this.toastr.success(toastServerRestarted, toastSuccess);
          this.$state.go('status');
        }
      });
    });

    this.checkTimeout = TimerObservable.create(20000).subscribe(() => {
      this.toastr.warning(toastServerRestartTimeout, toastWarning, {
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
