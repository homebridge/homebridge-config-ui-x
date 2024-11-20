import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { SettingsService } from '@/app/core/settings.service'
import { IoNamespace, WsService } from '@/app/core/ws.service'
import { DecimalPipe, NgClass, UpperCasePipe } from '@angular/common'
import { Component, ElementRef, inject, Input, OnDestroy, OnInit, viewChild } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'
import { ChartConfiguration } from 'chart.js'
import { BaseChartDirective } from 'ng2-charts'
import { interval, Subscription } from 'rxjs'

@Component({
  templateUrl: './cpu-widget.component.html',
  styleUrls: ['./cpu-widget.component.scss'],
  imports: [
    NgClass,
    BaseChartDirective,
    UpperCasePipe,
    DecimalPipe,
    TranslatePipe,
    ConvertTempPipe,
  ],
})
export class CpuWidgetComponent implements OnInit, OnDestroy {
  $settings = inject(SettingsService)
  private $ws = inject(WsService)

  @Input() public widget: any

  readonly chart = viewChild(BaseChartDirective)
  readonly widgetBackground = viewChild<ElementRef>('widgetbackground')

  public cpu = {} as any
  public cpuTemperature = {} as any
  public currentLoad = 0
  public refreshInterval: number
  public historyItems: number

  public lineChartType: ChartConfiguration['type'] = 'line'

  public lineChartData: ChartConfiguration['data'] = {
    datasets: [{ data: [] }],
  }

  public lineChartLabels = []

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
  }

  private io: IoNamespace
  private intervalSubscription: Subscription

  ngOnInit() {
    this.io = this.$ws.getExistingNamespace('status')
    // lookup the chart color based on the current theme
    const userColor = getComputedStyle(this.widgetBackground().nativeElement).backgroundColor
    if (userColor) {
      this.lineChartOptions.elements.line.backgroundColor = userColor
      this.lineChartOptions.elements.line.borderColor = userColor
    }

    this.io.connected.subscribe(async () => {
      this.getServerCpuInfo()
    })

    if (this.io.socket.connected) {
      this.getServerCpuInfo()
    }

    // Interval and history items should be in [1, 60]
    if (!this.widget.refreshInterval) {
      this.widget.refreshInterval = 10
    }
    if (!this.widget.historyItems) {
      this.widget.historyItems = 60
    }
    this.refreshInterval = Math.min(60, Math.max(1, Number.parseInt(this.widget.refreshInterval, 10)))
    this.historyItems = Math.min(60, Math.max(1, Number.parseInt(this.widget.historyItems, 10)))

    this.intervalSubscription = interval(this.refreshInterval * 1000).subscribe(() => {
      if (this.io.socket.connected) {
        this.getServerCpuInfo()
      }
    })
  }

  getServerCpuInfo() {
    this.io.request('get-server-cpu-info').subscribe((data) => {
      this.updateData(data)
      this.chart().update()
    })
  }

  updateData(data: any) {
    this.cpuTemperature = data.cpuTemperature
    this.currentLoad = data.currentLoad

    const dataLength = Object.keys(this.lineChartData.datasets[0].data).length
    if (!dataLength) {
      this.initializeChartData(data)
    } else {
      this.updateChartData(data, dataLength)
    }
  }

  initializeChartData(data: any) {
    const items = data.cpuLoadHistory.slice(-this.historyItems)
    this.lineChartData.datasets[0].data = { ...items }
    this.lineChartLabels = items.map(() => 'point')
  }

  updateChartData(data: any, dataLength: number) {
    this.lineChartData.datasets[0].data[dataLength] = data.currentLoad
    this.lineChartLabels.push('point')

    if (dataLength >= this.historyItems) {
      this.shiftChartData()
    }
  }

  shiftChartData() {
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

  ngOnDestroy() {
    this.intervalSubscription.unsubscribe()
  }
}
