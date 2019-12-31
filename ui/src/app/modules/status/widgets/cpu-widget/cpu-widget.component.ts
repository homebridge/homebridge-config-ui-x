import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription, interval } from 'rxjs';

import { WsService } from '../../../../core/ws.service';
import { AuthService } from '../../../../core/auth/auth.service';


@Component({
  selector: 'app-cpu-widget',
  templateUrl: './cpu-widget.component.html',
  styleUrls: ['./cpu-widget.component.scss'],
})
export class CpuWidgetComponent implements OnInit, OnDestroy {
  private io = this.$ws.getExistingNamespace('status');
  private intervalSubscription: Subscription;

  public cpu = {} as any;
  public cpuTemperature = {} as any;
  public currentLoad = {} as any;

  constructor(
    private $ws: WsService,
    public $auth: AuthService,
  ) { }

  ngOnInit() {
    this.io.connected.subscribe(async () => {
      this.getServerUptimeInfo();
    });

    if (this.io.socket.connected) {
      this.getServerUptimeInfo();
    }

    this.intervalSubscription = interval(9000).subscribe(() => {
      if (this.io.socket.connected) {
        this.getServerUptimeInfo();
      }
    });
  }

  getServerUptimeInfo() {
    this.io.request('get-server-cpu-info').subscribe((data) => {
      this.cpu = data.cpu;
      this.cpuTemperature = data.cpuTemperature;
      this.currentLoad = data.currentLoad;
    });
  }

  ngOnDestroy() {
    this.intervalSubscription.unsubscribe();
  }
}
