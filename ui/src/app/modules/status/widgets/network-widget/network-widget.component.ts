import { DecimalPipe, NgClass } from '@angular/common'
import { Component, ElementRef, inject, Input, OnDestroy, OnInit, viewChild } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'
import { ChartConfiguration } from 'chart.js'
import { BaseChartDirective } from 'ng2-charts'
import { interval, Subscription } from 'rxjs'

import { IoNamespace, WsService } from '@/app/core/ws.service'
import { Widget } from '@/app/modules/status/widgets/widgets.interfaces'

@Component({
  templateUrl: './network-widget.component.html',
  styleUrls: ['./network-widget.component.scss'],
  standalone: true,
  imports: [
    NgClass,
    BaseChartDirective,
    DecimalPipe,
    TranslatePipe,
  ],
})
export class NetworkWidgetComponent implements OnInit, OnDestroy {
  private $ws = inject(WsService)
  private io: IoNamespace
  private intervalSubscription: Subscription

  @Input() public widget: Widget

  readonly chart = viewChild(BaseChartDirective)
  readonly widgetBackground = viewChild<ElementRef>('widgetbackground')

  public interface: string
  public receivedPerSec: number
  public sentPerSec: number
  public refreshInterval: number
  public historyItems: number
  public lineChartLabels = []
  public lineChartType: ChartConfiguration['type'] = 'line'

  public lineChartData: ChartConfiguration['data'] = {
    datasets: [{ data: [] }],
  }

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
  }

  public ngOnInit() {
    this.io = this.$ws.getExistingNamespace('status')
    // Lookup the chart color based on the current theme
    const userColor = getComputedStyle(this.widgetBackground().nativeElement).backgroundColor
    if (userColor) {
      this.lineChartOptions.elements.line.backgroundColor = userColor
      this.lineChartOptions.elements.line.borderColor = userColor
    }

    this.io.connected.subscribe(async () => {
      this.getServerNetworkInfo()
    })

    if (this.io.socket.connected) {
      this.getServerNetworkInfo()
    }

    // Interval and history items should be in [1, 60]
    if (!this.widget.refreshInterval) {
      this.widget.refreshInterval = 10
    }
    if (!this.widget.historyItems) {
      this.widget.historyItems = 60
    }
    this.refreshInterval = Math.min(60, Math.max(1, this.widget.refreshInterval))
    this.historyItems = Math.min(60, Math.max(1, this.widget.historyItems))

    this.intervalSubscription = interval(this.refreshInterval * 1000).subscribe(() => {
      if (this.io.socket.connected) {
        this.getServerNetworkInfo()
      }
    })
  }

  public ngOnDestroy() {
    this.intervalSubscription.unsubscribe()
  }

  private getServerNetworkInfo() {
    this.io.request('get-server-network-info', { netInterfaces: [this.widget.networkInterface] }).subscribe((data) => {
      // If no param given, the backend will return the default network interface
      // Clear the current chart if the network interface has changed
      if (this.interface !== data.net.iface) {
        this.widget.networkInterface = data.net.iface
        this.interface = data.net.iface
        this.lineChartData.datasets[0].data = { ...[] }
        this.lineChartLabels = []
        this.chart().update()
      }

      this.receivedPerSec = (data.net.rx_sec / 1024 / 1024) * 8
      this.sentPerSec = (data.net.tx_sec / 1024 / 1024) * 8

      // The chart looks strange if the data rate is < 1.
      if (data.point < 1) {
        data.point = 0
      }

      this.updateData(data)
      this.chart().update()
    })
  }

  private updateData(data: any) {
    const dataLength = Object.keys(this.lineChartData.datasets[0].data).length
    if (!dataLength) {
      this.initializeChartData(data)
    } else {
      this.updateChartData(data, dataLength)
    }
  }

  private initializeChartData(data: any) {
    const items = [data.point]
    this.lineChartData.datasets[0].data = { ...items }
    this.lineChartLabels = items.map(() => 'point')
  }

  private updateChartData(data: any, dataLength: number) {
    this.lineChartData.datasets[0].data[dataLength] = data.point
    this.lineChartLabels.push('point')

    if (dataLength >= this.historyItems) {
      this.shiftChartData()
    }
  }

  private shiftChartData() {
    const newItems = {}
    Object.keys(this.lineChartData.datasets[0].data).forEach((key, index, array) => {
      if (index + 1 < array.length) {
        newItems[key] = this.lineChartData.datasets[0].data[array[index + 1]]
      }
    })

    // @ts-expect-error - TS2740: Type {} is missing the following properties from type...
    this.lineChartData.datasets[0].data = newItems
    this.lineChartLabels = this.lineChartLabels.slice(1)
  }
}
