import type { MemoryWidgetData } from '@/app/modules/status/widgets/widgets.interfaces'

import { DecimalPipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, signal } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'
import { BaseChartDirective } from 'ng2-charts'

import { BaseChartWidgetComponent } from '@/app/modules/status/widgets/base-chart-widget.component'

@Component({
  templateUrl: './memory-widget.component.html',
  styleUrls: ['./memory-widget.component.scss'],
  standalone: true,
  imports: [
    BaseChartDirective,
    DecimalPipe,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MemoryWidgetComponent extends BaseChartWidgetComponent {
  // Signals
  public totalMemory = signal<number>(0)
  public freeMemory = signal<number>(0)

  protected fetchData(): void {
    this.io.request('get-server-memory-info').subscribe((data: MemoryWidgetData) => {
      this.updateData(data)
      this.chart().update()
    })
  }

  protected updateData(data: MemoryWidgetData): void {
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
