import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import { TranslateModule } from '@ngx-translate/core'
import { GridsterModule } from 'angular-gridster2'
import { BaseChartDirective, provideCharts, withDefaultRegisterables } from 'ng2-charts'
import { DragulaModule } from 'ng2-dragula'

import { AccessoriesCoreModule } from '@/app/core/accessories/accessories.module'
import { ManagePluginsModule } from '@/app/core/manage-plugins/manage-plugins.module'
import { CreditsComponent } from '@/app/modules/status/credits/credits.component'
import { StatusComponent } from '@/app/modules/status/status.component'
import { WidgetControlComponent } from '@/app/modules/status/widget-control/widget-control.component'
import { WidgetVisibilityComponent } from '@/app/modules/status/widget-visibility/widget-visibility.component'
import { AccessoriesWidgetComponent } from '@/app/modules/status/widgets/accessories-widget/accessories-widget.component'
import { BridgesWidgetComponent } from '@/app/modules/status/widgets/bridges-widget/bridges-widget.component'
import { ClockWidgetComponent } from '@/app/modules/status/widgets/clock-widget/clock-widget.component'
import { CpuWidgetComponent } from '@/app/modules/status/widgets/cpu-widget/cpu-widget.component'
import { HapQrcodeWidgetComponent } from '@/app/modules/status/widgets/hap-qrcode-widget/hap-qrcode-widget.component'
import { HomebridgeLogsWidgetComponent } from '@/app/modules/status/widgets/homebridge-logs-widget/homebridge-logs-widget.component'
import { MemoryWidgetComponent } from '@/app/modules/status/widgets/memory-widget/memory-widget.component'
import { NetworkWidgetComponent } from '@/app/modules/status/widgets/network-widget/network-widget.component'
import { SystemInfoWidgetComponent } from '@/app/modules/status/widgets/system-info-widget/system-info-widget.component'
import { UiV5ModalComponent } from '@/app/modules/status/widgets/system-info-widget/ui-v5-modal/ui-v5-modal.component'
import { TerminalWidgetComponent } from '@/app/modules/status/widgets/terminal-widget/terminal-widget.component'
import { UpdateInfoWidgetComponent } from '@/app/modules/status/widgets/update-info-widget/update-info-widget.component'
import { UptimeWidgetComponent } from '@/app/modules/status/widgets/uptime-widget/uptime-widget.component'
import { WeatherWidgetComponent } from '@/app/modules/status/widgets/weather-widget/weather-widget.component'
import { WidgetsComponent } from '@/app/modules/status/widgets/widgets.component'

@NgModule({
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule.forChild(),
    NgbModule,
    GridsterModule,
    DragulaModule,
    BaseChartDirective,
    AccessoriesCoreModule,
    ManagePluginsModule,
    StatusComponent,
    WidgetsComponent,
    WidgetVisibilityComponent,
    WidgetControlComponent,
    HapQrcodeWidgetComponent,
    HomebridgeLogsWidgetComponent,
    TerminalWidgetComponent,
    CpuWidgetComponent,
    MemoryWidgetComponent,
    NetworkWidgetComponent,
    UptimeWidgetComponent,
    UpdateInfoWidgetComponent,
    SystemInfoWidgetComponent,
    WeatherWidgetComponent,
    AccessoriesWidgetComponent,
    ClockWidgetComponent,
    BridgesWidgetComponent,
    CreditsComponent,
    UiV5ModalComponent,
  ],
  providers: [
    provideCharts(withDefaultRegisterables()),
  ],
})
export class StatusModule {}
