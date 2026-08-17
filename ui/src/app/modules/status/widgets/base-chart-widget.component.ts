import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, input, OnDestroy, OnInit, viewChild } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { ChartConfiguration } from 'chart.js'
import { BaseChartDirective } from 'ng2-charts'
import { interval, Subject } from 'rxjs'
import { takeUntil } from 'rxjs/operators'

import { IoNamespace, WsService } from '@/app/core/communication/ws.service'
import { Widget } from '@/app/modules/status/widgets/widgets.interfaces'

/**
 * Base class for chart-based widget components (CPU, Memory, Network)
 * Extracts common functionality for chart initialization, data management, and interval handling
 */
@Component({
  selector: 'app-base-chart-widget',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export abstract class BaseChartWidgetComponent implements OnInit, OnDestroy {
  // Injected dependencies
  protected destroyRef = inject(DestroyRef)
  protected $ws = inject(WsService)

  // Signals
  public readonly widget = input.required<Widget>()
  readonly chart = viewChild(BaseChartDirective)
  readonly widgetBackground = viewChild<ElementRef>('widgetbackground')

  // Other properties
  protected io!: IoNamespace
  protected stopInterval$ = new Subject<void>()
  public resizeEvent!: Subject<void> // Set directly by ComponentFactoryResolver
  public configureEvent!: Subject<void> // Set directly by ComponentFactoryResolver
  public refreshInterval!: number
  public historyItems!: number
  public lineChartLabels: string[] = []
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
        max: 100,
        min: 0,
      },
    },
  }

  public ngOnInit(): void {
    this.io = this.$ws.getExistingNamespace('status')

    // Lookup the chart color based on the current theme
    const userColor = getComputedStyle(this.widgetBackground()!.nativeElement).backgroundColor
    if (userColor) {
      this.lineChartOptions!.elements!.line!.backgroundColor = userColor
      this.lineChartOptions!.elements!.line!.borderColor = userColor
    }

    // Before the connected subscription, not after: `connected` is a
    // ReplaySubject, so on the usual path — the status page already has the
    // socket open — subscribing fires fetchData() synchronously. With the
    // interval and history size still unset at that point, initializeChartData
    // sliced by `undefined` and seeded the chart with the server's whole
    // history rather than the configured number of points.
    this.initializeWidget()

    this.io.connected!.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.fetchData()
    })

    // Listen for configuration changes
    this.configureEvent.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.reinitializeWidget()
    })
  }

  public ngOnDestroy(): void {
    this.stopInterval$.complete()
  }

  protected initializeWidget(): void {
    // Interval and history items should be in [1, 60]
    if (!this.widget().refreshInterval) {
      this.widget().refreshInterval = 10
    }
    if (!this.widget().historyItems) {
      this.widget().historyItems = 60
    }
    this.refreshInterval = Math.min(60, Math.max(1, this.widget().refreshInterval!))
    this.historyItems = Math.min(60, Math.max(1, this.widget().historyItems!))

    interval(this.refreshInterval * 1000)
      .pipe(
        takeUntil(this.stopInterval$),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        if (this.io.socket.connected) {
          this.fetchData()
        }
      })
  }

  protected reinitializeWidget(): void {
    // Stop the old interval
    this.stopInterval$.next()

    // Clear the chart data
    this.lineChartData.datasets[0].data = []
    this.lineChartLabels = []

    // Reinitialize with new settings
    this.initializeWidget()

    // Fetch new data immediately
    if (this.io.socket.connected) {
      this.fetchData()
    }
  }

  protected initializeChartData(historyData: number[]): void {
    const items = historyData.slice(-this.historyItems)
    this.lineChartData.datasets[0].data = { ...items }
    this.lineChartLabels = items.map(() => 'point')
  }

  protected updateChartData(currentValue: number): void {
    // Make room first so the series never holds more than historyItems points
    if (Object.keys(this.lineChartData.datasets[0].data).length >= this.historyItems) {
      this.shiftChartData()
    }

    const dataLength = Object.keys(this.lineChartData.datasets[0].data).length
    this.lineChartData.datasets[0].data[dataLength] = currentValue
    this.lineChartLabels.push('point')
  }

  protected shiftChartData(): void {
    const newItems: Record<string, number> = {}
    Object.keys(this.lineChartData.datasets[0].data).forEach((key: string, index: number, array: string[]) => {
      if (index + 1 < array.length) {
        newItems[key] = (this.lineChartData.datasets[0].data as unknown as Record<string, number>)[array[index + 1]]
      }
    })

    // @ts-expect-error - TS2740: Type {} is missing the following properties from type...
    this.lineChartData.datasets[0].data = newItems
    this.lineChartLabels = this.lineChartLabels.slice(1)
  }

  /**
   * Fetch data from the server via socket.io
   * Child classes must implement this method
   */
  protected abstract fetchData(): void

  /**
   * Update widget-specific data and chart
   * Child classes must implement this method
   */
  protected abstract updateData(data: any): void
}
