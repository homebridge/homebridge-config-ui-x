import type { CpuWidgetData } from '@/app/modules/status/widgets/widgets.interfaces'

import { DecimalPipe, UpperCasePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'
import { BaseChartDirective } from 'ng2-charts'

import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { SettingsService } from '@/app/core/ui/settings.service'
import { BaseChartWidgetComponent } from '@/app/modules/status/widgets/base-chart-widget.component'

@Component({
  templateUrl: './cpu-widget.component.html',
  styleUrl: './cpu-widget.component.scss',
  standalone: true,
  imports: [
    BaseChartDirective,
    UpperCasePipe,
    DecimalPipe,
    TranslatePipe,
    ConvertTempPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CpuWidgetComponent extends BaseChartWidgetComponent {
  // Injected dependencies
  private $settings = inject(SettingsService)

  // Signals
  public readonly cpuTemperature = signal<CpuWidgetData['cpuTemperature']>({})
  public readonly currentLoad = signal<number>(0)

  // Other properties
  public temperatureUnits = this.$settings.env.temperatureUnits

  protected fetchData(): void {
    this.io.request('get-server-cpu-info').subscribe((data: CpuWidgetData) => {
      this.updateData(data)
      this.chart().update()
    })
  }

  protected updateData(data: CpuWidgetData): void {
    this.cpuTemperature.set(data.cpuTemperature)
    this.currentLoad.set(data.currentLoad)

    const dataLength = Object.keys(this.lineChartData.datasets[0].data).length
    if (!dataLength) {
      this.initializeChartData(data.cpuLoadHistory)
    } else {
      this.updateChartData(data.currentLoad)
    }
  }
}
