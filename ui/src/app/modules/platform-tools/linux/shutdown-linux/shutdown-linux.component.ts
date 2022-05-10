import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';

import { ApiService } from '@/app/core/api.service';
import { WsService } from '@/app/core/ws.service';
import { SettingsService } from '@/app/core/settings.service';

@Component({
  selector: 'app-shutdown-linux',
  templateUrl: './shutdown-linux.component.html',
  styleUrls: ['./shutdown-linux.component.scss'],
})
export class ShutdownLinuxComponent implements OnInit, OnDestroy {
  private io = this.$ws.connectToNamespace('status');

  checkTimeout: NodeJS.Timeout;
  checkDelay: NodeJS.Timeout;
  resp: any = {};
  timeout = false;
  error: any = false;

  constructor(
    private $api: ApiService,
    private $ws: WsService,
    private $settings: SettingsService,
    public $toastr: ToastrService,
    private translate: TranslateService,
    private $router: Router,
  ) { }

  ngOnInit() {
    this.io.connected.subscribe(() => {
      this.io.socket.emit('monitor-server-status');
      this.$settings.getAppSettings().catch(/* do nothing */);
    });

    this.$api.put('/platform-tools/linux/shutdown-host', {}).subscribe(
      data => {
        this.resp = data;
        this.checkIfServerUp();
      },
      err => {
        this.error = this.translate.instant('platform.linux.restart.toast_server_restart_error');
        this.$toastr.error(`${this.error}: ${err.message}`, this.translate.instant('toast.title_error'));
      },
    );
  }

  checkIfServerUp() {
    this.checkDelay = setTimeout(() => {
      // listen to homebridge-status events to see when it's back online
      this.io.socket.on('homebridge-status', (data) => {
        if (data.status === 'up' || data.status === 'pending') {
          this.$toastr.success(
            this.translate.instant('platform.linux.restart.toast_server_restarted'),
            this.translate.instant('toast.title_success'),
          );
          this.$router.navigate(['/']);
        }
      });
    }, 30000);

    this.checkTimeout = setTimeout(() => {
      this.$toastr.warning(
        this.translate.instant('platform.linux.restart.toast_server_taking_long_time_to_come_online'),
        this.translate.instant('toast.title_warning',
        ), {
        timeOut: 10000,
      });
      this.timeout = true;
    }, 120000);
  }

  ngOnDestroy() {
    this.io.end();

    clearTimeout(this.checkDelay);
    clearTimeout(this.checkTimeout);
  }
}
