import type { MemoryWidgetData } from '@/app/modules/status/widgets/widgets.interfaces'

import { DecimalPipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'
import { BaseChartDirective } from 'ng2-charts'

import { SettingsService } from '@/app/core/ui/settings.service'
import { BaseChartWidgetComponent } from '@/app/modules/status/widgets/base-chart-widget.component'

@Component({
  selector: 'app-memory-widget',
  imports: [
    BaseChartDirective,
    DecimalPipe,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './memory-widget.component.html',
  styleUrl: './memory-widget.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MemoryWidgetComponent extends BaseChartWidgetComponent {
  // Injected dependencies
  private $settings = inject(SettingsService)

  // Signals
  public readonly totalMemory = signal<number>(0)
  public readonly freeMemory = signal<number>(0)

  // Other properties
  public metricsDisabled = this.$settings.env.disableServerMetricsMonitoring === true

  protected fetchData(): void {
    if (this.metricsDisabled) {
      return
    }
    this.io.request('get-server-memory-info').subscribe((data: MemoryWidgetData) => {
      this.updateData(data)
      this.chart()?.update()
    })
  }

  protected updateData(data: MemoryWidgetData): void {
    if (!data.mem) {
      return
    }
    this.totalMemory.set(data.mem.total / 1024 / 1024 / 1024)
    this.freeMemory.set(data.mem.available / 1024 / 1024 / 1024)

    const dataLength = Object.keys(this.lineChartData.datasets[0].data).length
    if (!dataLength) {
      this.initializeChartData(data.memoryUsageHistory)
    } else {
      this.updateChartData(data.memoryUsageHistory.slice(-1)[0])
    }
  }
}
