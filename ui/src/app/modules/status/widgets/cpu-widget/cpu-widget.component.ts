import { Component, OnInit, OnDestroy, ViewChild, ElementRef, Input } from '@angular/core';
import { Subscription, interval } from 'rxjs';
import { ChartOptions } from 'chart.js';
import { Color, BaseChartDirective } from 'ng2-charts';

import { WsService } from '../../../../core/ws.service';
import { AuthService } from '../../../../core/auth/auth.service';

@Component({
  selector: 'app-cpu-widget',
  templateUrl: './cpu-widget.component.html',
  styleUrls: ['./cpu-widget.component.scss'],
})
export class CpuWidgetComponent implements OnInit, OnDestroy {
  @Input() public widget;

  private io = this.$ws.getExistingNamespace('status');
  private intervalSubscription: Subscription;

  @ViewChild(BaseChartDirective, { static: true }) private chart: BaseChartDirective;
  @ViewChild('widgetbackground', { static: true }) private widgetBackground: ElementRef;

  public cpu = {} as any;
  public cpuTemperature = {} as any;
  public currentLoad = 0;

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
          ticks: {
            max: 100,
            min: 0,
          },
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
      this.getServerCpuInfo();
    });

    if (this.io.socket.connected) {
      this.getServerCpuInfo();
    }

    this.intervalSubscription = interval(9000).subscribe(() => {
      if (this.io.socket.connected) {
        this.getServerCpuInfo();
      }
    });

    // lookup the chart color based on the current theme
    const chartColor = getComputedStyle(this.widgetBackground.nativeElement).backgroundColor;
    if (chartColor) {
      this.lineChartColors[0].backgroundColor = chartColor;
      this.lineChartColors[0].borderColor = chartColor;
    }
  }

  getServerCpuInfo() {
    this.io.request('get-server-cpu-info').subscribe((data) => {
      this.cpuTemperature = data.cpuTemperature;
      this.currentLoad = data.currentLoad;

      if (!this.lineChartData[0].data.length) {
        this.lineChartData[0].data = data.cpuLoadHistory;
        this.lineChartLabels = data.cpuLoadHistory.map(x => 'point');
      } else {
        this.lineChartData[0].data.push(data.currentLoad);
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
