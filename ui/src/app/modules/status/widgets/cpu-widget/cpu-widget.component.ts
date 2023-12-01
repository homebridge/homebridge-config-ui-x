import {
  Component,
  ElementRef,
  Input,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { ChartConfiguration } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { Subscription, interval } from 'rxjs';
import { SettingsService } from '@/app/core/settings.service';
import { WsService } from '@/app/core/ws.service';

@Component({
  selector: 'app-cpu-widget',
  templateUrl: './cpu-widget.component.html',
  styleUrls: ['./cpu-widget.component.scss'],
})
export class CpuWidgetComponent implements OnInit, OnDestroy {
  @Input() public widget;

  @ViewChild(BaseChartDirective, { static: true }) private chart: BaseChartDirective;
  @ViewChild('widgetbackground', { static: true }) private widgetBackground: ElementRef;

  public cpu = {} as any;
  public cpuTemperature = {} as any;
  public currentLoad = 0;

  public lineChartType: ChartConfiguration['type'] = 'line';

  public lineChartData: ChartConfiguration['data'] = {
    datasets: [{ data: [] }],
  };

  public lineChartLabels = [];

  public lineChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    elements: {
      point: {
        radius: 0,
      },
      line: {
        tension: 0.4,
        backgroundColor: 'rgba(148,159,177,0.2)',
        borderColor: 'rgba(148,159,177,0.2)',
        fill: 'origin',
      },
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        enabled: false,
      },
    },
    scales: {
      x: {
        display: false,
      },
      y: {
        display: false,
        max: 100,
        min: 0,
      },
    },
  };

  private io = this.$ws.getExistingNamespace('status');
  private intervalSubscription: Subscription;

  constructor(
    private $ws: WsService,
    public $settings: SettingsService,
  ) {}

  ngOnInit() {
    // lookup the chart color based on the current theme
    const userColor = getComputedStyle(this.widgetBackground.nativeElement).backgroundColor;
    if (userColor) {
      this.lineChartOptions.elements.line.backgroundColor = userColor;
      this.lineChartOptions.elements.line.borderColor = userColor;
    }

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
  }

  getServerCpuInfo() {
    this.io.request('get-server-cpu-info').subscribe((data) => {
      this.cpuTemperature = data.cpuTemperature;
      this.currentLoad = data.currentLoad;

      if (!this.lineChartData.datasets[0].data.length) {
        this.lineChartData.datasets[0].data = {
          ...data.cpuLoadHistory,
        };
        this.lineChartLabels = data.cpuLoadHistory.map(x => 'point');
      } else {
        this.lineChartData.datasets[0].data.push(data.currentLoad);
        this.lineChartLabels.push('point');

        if (this.lineChartData.datasets[0].data.length > 60) {
          this.lineChartData.datasets[0].data.shift();
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
