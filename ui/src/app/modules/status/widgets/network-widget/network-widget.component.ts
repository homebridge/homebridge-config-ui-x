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
import { AuthService } from '@/app/core/auth/auth.service';
import { IoNamespace, WsService } from '@/app/core/ws.service';

@Component({
  selector: 'app-network-widget',
  templateUrl: './network-widget.component.html',
  styleUrls: ['./network-widget.component.scss'],
})
export class NetworkWidgetComponent implements OnInit, OnDestroy {
  @Input() widget;

  @ViewChild(BaseChartDirective, { static: true }) public chart: BaseChartDirective;
  @ViewChild('widgetbackground', { static: true }) private widgetBackground: ElementRef;

  public interface: string;
  public receivedPerSec: number;
  public sentPerSec: number;

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
        min: 0,
      },
    },
  };

  private io: IoNamespace;
  private intervalSubscription: Subscription;

  constructor(
    private $ws: WsService,
    public $auth: AuthService,
  ) {}

  ngOnInit() {
    this.io = this.$ws.getExistingNamespace('status');
    // lookup the chart color based on the current theme
    const userColor = getComputedStyle(this.widgetBackground.nativeElement).backgroundColor;
    if (userColor) {
      this.lineChartOptions.elements.line.backgroundColor = userColor;
      this.lineChartOptions.elements.line.borderColor = userColor;
    }

    this.io.connected.subscribe(async () => {
      this.getServerNetworkInfo();
    });

    if (this.io.socket.connected) {
      this.getServerNetworkInfo();
    }

    if (!this.widget.refreshInterval) {
      this.widget.refreshInterval = 10;
    }

    // Interval should be in [1, 60]
    const refreshInterval = Math.min(60, Math.max(1, parseInt(this.widget.refreshInterval, 10)));
    this.intervalSubscription = interval(refreshInterval * 1000).subscribe(() => {
      if (this.io.socket.connected) {
        this.getServerNetworkInfo();
      }
    });
  }

  getServerNetworkInfo() {
    this.io.request('get-server-network-info', { netInterfaces: [this.widget.networkInterface] }).subscribe((data) => {
      // If no param given, the backend will return the default network interface
      // Clear the current chart if the network interface has changed
      if (this.interface !== data.net.iface) {
        this.widget.networkInterface = data.net.iface;
        this.interface = data.net.iface;
        this.lineChartData.datasets[0].data = { ...[] };
        this.lineChartLabels = [];
        this.chart.update();
      }

      this.receivedPerSec = (data.net.rx_sec / 1024 / 1024) * 8;
      this.sentPerSec = (data.net.tx_sec / 1024 / 1024) * 8;

      // the chart looks strange if the data rate is < 1.
      if (data.point < 1) {
        data.point = 0;
      }

      const dataLength = Object.keys(this.lineChartData.datasets[0].data).length;
      if (!dataLength) {
        this.lineChartData.datasets[0].data = {
          ...[data.point],
        };
        this.lineChartLabels.push('point');
      } else {
        this.lineChartData.datasets[0].data[dataLength] = data.point;
        this.lineChartLabels.push('point');

        if (dataLength > 60) {
          delete this.lineChartData.datasets[0].data[0];
          this.lineChartData.datasets[0].data = { ...this.lineChartData.datasets[0].data };
          this.lineChartLabels.shift();
        }
      }

      this.chart.update();
    });
  }

  ngOnDestroy() {
    this.intervalSubscription.unsubscribe();
  }
}
