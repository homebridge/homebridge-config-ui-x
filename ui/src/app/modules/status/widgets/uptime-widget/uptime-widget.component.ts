import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription, interval } from 'rxjs';
import { AuthService } from '@/app/core/auth/auth.service';
import { WsService } from '@/app/core/ws.service';

@Component({
  selector: 'app-uptime-widget',
  templateUrl: './uptime-widget.component.html',
  styleUrls: ['./uptime-widget.component.scss'],
})
export class UptimeWidgetComponent implements OnInit, OnDestroy {
  private io = this.$ws.getExistingNamespace('status');
  private intervalSubscription: Subscription;

  public serverUptime: string;
  public processUptime: string;

  constructor(
    private $ws: WsService,
    public $auth: AuthService,
  ) {
  }

  ngOnInit() {
    this.io.connected.subscribe(async () => {
      this.getServerUptimeInfo();
    });

    if (this.io.socket.connected) {
      this.getServerUptimeInfo();
    }

    this.intervalSubscription = interval(11000).subscribe(() => {
      if (this.io.socket.connected) {
        this.getServerUptimeInfo();
      }
    });
  }

  getServerUptimeInfo() {
    this.io.request('get-server-uptime-info').subscribe((data) => {
      this.serverUptime = this.humaniseDuration(data.time.uptime);
      this.processUptime = this.humaniseDuration(data.processUptime);
    });
  }

  humaniseDuration(seconds: number) {
    if (seconds < 50) {
      return '< 1m';
    }
    if (seconds < 3600) {
      return Math.round((seconds / 60)) + 'm';
    }
    if (seconds < 86400) {
      return Math.round((seconds / 60 / 60)) + 'h';
    }
    return Math.floor((seconds / 60 / 60 / 24)) + 'd';
  }

  ngOnDestroy() {
    this.intervalSubscription.unsubscribe();
  }

}
