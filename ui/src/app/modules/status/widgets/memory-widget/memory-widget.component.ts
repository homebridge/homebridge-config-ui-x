import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { ChartConfiguration } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { Subscription, interval } from 'rxjs';
import { AuthService } from '@/app/core/auth/auth.service';
import { WsService } from '@/app/core/ws.service';

@Component({
  selector: 'app-memory-widget',
  templateUrl: './memory-widget.component.html',
  styleUrls: ['./memory-widget.component.scss'],
})
export class MemoryWidgetComponent implements OnInit, OnDestroy {
  @ViewChild(BaseChartDirective, { static: true }) public chart: BaseChartDirective;
  @ViewChild('widgetbackground', { static: true }) private widgetBackground: ElementRef;

  public totalMemory: number;
  public freeMemory: number;

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
      y:
        {
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
    public $auth: AuthService,
  ) {}

  ngOnInit() {
    // lookup the chart color based on the current theme
    const userColor = getComputedStyle(this.widgetBackground.nativeElement).backgroundColor;
    if (userColor) {
      this.lineChartOptions.elements.line.backgroundColor = userColor;
      this.lineChartOptions.elements.line.borderColor = userColor;
    }

    this.io.connected.subscribe(async () => {
      this.getServerMemoryInfo();
    });

    if (this.io.socket.connected) {
      this.getServerMemoryInfo();
    }

    this.intervalSubscription = interval(12000).subscribe(() => {
      if (this.io.socket.connected) {
        this.getServerMemoryInfo();
      }
    });
  }

  getServerMemoryInfo() {
    this.io.request('get-server-memory-info').subscribe((data) => {
      this.totalMemory = data.mem.total / 1024 / 1024 / 1024;
      this.freeMemory = data.mem.available / 1024 / 1024 / 1024;

      if (!this.lineChartData.datasets[0].data.length) {
        this.lineChartData.datasets[0].data = {
          ...data.memoryUsageHistory,
        };
        this.lineChartLabels = data.memoryUsageHistory.map(x => 'point');
      } else {
        this.lineChartData.datasets[0].data.push(data.memoryUsageHistory.slice(-1)[0]);
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
