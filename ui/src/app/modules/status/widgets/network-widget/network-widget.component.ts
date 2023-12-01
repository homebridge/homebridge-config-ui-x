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
  selector: 'app-network-widget',
  templateUrl: './network-widget.component.html',
  styleUrls: ['./network-widget.component.scss'],
})
export class NetworkWidgetComponent implements OnInit, OnDestroy {
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

      if (!this.lineChartData.datasets[0].data.length) {
        this.lineChartData.datasets[0].data = {
          ...data.point,
        };
        this.lineChartLabels = ['point'];
      } else {
        this.lineChartData.datasets[0].data.push(data.point);
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
