import type { NetworkWidgetData } from '@/app/modules/status/widgets/widgets.interfaces'

import { DecimalPipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, signal } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'
import { BaseChartDirective } from 'ng2-charts'

import { BaseChartWidgetComponent } from '@/app/modules/status/widgets/base-chart-widget.component'

@Component({
  selector: 'app-network-widget',
  imports: [
    BaseChartDirective,
    DecimalPipe,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './network-widget.component.html',
  styleUrl: './network-widget.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NetworkWidgetComponent extends BaseChartWidgetComponent {
  // Signals
  public readonly interface = signal<string>('')
  public readonly receivedPerSec = signal<number>(0)
  public readonly sentPerSec = signal<number>(0)

  protected fetchData(): void {
    this.io.request('get-server-network-info', { netInterfaces: [this.widget().networkInterface] }).subscribe((data: NetworkWidgetData) => {
      // If no param given, the backend will return the default network interface
      // Clear the current chart if the network interface has changed
      if (this.interface() !== data.net.iface) {
        this.widget().networkInterface = data.net.iface
        this.interface.set(data.net.iface)
        this.lineChartData.datasets[0].data = { ...[] }
        this.lineChartLabels = []
        this.chart().update()
      }

      this.receivedPerSec.set((data.net.rx_sec / 1024 / 1024) * 8)
      this.sentPerSec.set((data.net.tx_sec / 1024 / 1024) * 8)

      // The chart looks strange if the data rate is < 1.
      if (data.point < 1) {
        data.point = 0
      }

      this.updateData(data)
      this.chart().update()
    })
  }

  protected updateData(data: NetworkWidgetData): void {
    const dataLength = Object.keys(this.lineChartData.datasets[0].data).length
    if (!dataLength) {
      // Network widget initializes with a single point instead of history
      const items = [data.point]
      this.initializeChartData(items)
    } else {
      this.updateChartData(data.point)
    }
  }
}
