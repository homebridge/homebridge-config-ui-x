import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { interval, Subscription } from 'rxjs';
import { ChartOptions } from 'chart.js';
import { Color, BaseChartDirective } from 'ng2-charts';

import { WsService } from '@/app/core/ws.service';
import { AuthService } from '@/app/core/auth/auth.service';

@Component({
  selector: 'app-network-widget',
  templateUrl: './network-widget.component.html',
  styleUrls: ['./network-widget.component.scss'],
})
export class NetworkWidgetComponent implements OnInit, OnDestroy {
  private io = this.$ws.getExistingNamespace('status');
  private intervalSubscription: Subscription;

  @ViewChild(BaseChartDirective, { static: true }) public chart: BaseChartDirective;
  @ViewChild('widgetbackground', { static: true }) private widgetBackground: ElementRef;

  public interface: string;
  public receivedPerSec: number;
  public sentPerSec: number;

  public lineChartData = [{ data: [] }];
  public lineChartLabels = [];

  public lineChartOptions: (ChartOptions & { annotation: any }) = {
    responsive: true,
    legend: {
      display: false,
    },
    tooltips: {
      enabled: false,
    },
    scales: {
      xAxes: [
        {
          display: false,
        },
      ],
      yAxes: [
        {
          display: false,
        },
      ],
    },
    annotation: {
      annotations: [],
    },
  };

  public lineChartColors: Color[] = [
    { // grey
      backgroundColor: 'rgba(148,159,177,0.2)',
      borderColor: 'rgba(148,159,177,0.2)',
      pointRadius: 0,
      borderWidth: 1,
    },
  ];

  constructor(
    private $ws: WsService,
    public $auth: AuthService,
  ) { }

  ngOnInit() {
    this.io.connected.subscribe(async () => {
      this.getServerNetworkInfo();
    });

    if (this.io.socket.connected) {
      this.getServerNetworkInfo();
    }

    // refresh data once per second
    this.intervalSubscription = interval(1000).subscribe(() => {
      if (this.io.socket.connected) {
        this.getServerNetworkInfo();
      }
    });

    // lookup the chart color based on the current theme
    const chartColor = getComputedStyle(this.widgetBackground.nativeElement).backgroundColor;
    if (chartColor) {
      this.lineChartColors[0].backgroundColor = chartColor;
      this.lineChartColors[0].borderColor = chartColor;
    }
  }

  getServerNetworkInfo() {
    this.io.request('get-server-network-info').subscribe((data) => {
      this.receivedPerSec = (data.net.rx_sec / 1024 / 1024) * 8;
      this.sentPerSec = (data.net.tx_sec / 1024 / 1024) * 8;
      this.interface = data.net.iface;

      // the chart looks strange if the data rate is < 1.
      if (data.point < 1) {
        data.point = 0;
      }

      if (!this.lineChartData[0].data.length) {
        this.lineChartData[0].data = [data.point];
        this.lineChartLabels = ['point'];
      } else {
        this.lineChartData[0].data.push(data.point);
        this.lineChartLabels.push('point');

        if (this.lineChartData[0].data.length > 60) {
          this.lineChartData[0].data.shift();
          this.lineChartLabels.shift();
          this.chart.update();
        }
      }
    });
  }

  ngOnDestroy() {
    this.intervalSubscription.unsubscribe();
  }

}
