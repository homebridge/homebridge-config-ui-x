import { AccessoriesCoreModule } from '@/app/core/accessories/accessories.module'
import { CoreModule } from '@/app/core/core.module'
import { ManagePluginsModule } from '@/app/core/manage-plugins/manage-plugins.module'
import { CreditsComponent } from '@/app/modules/status/credits/credits.component'
import { StatusComponent } from '@/app/modules/status/status.component'
import { AccessoriesWidgetComponent } from '@/app/modules/status/widgets/accessories-widget/accessories-widget.component'
import { ChildBridgeWidgetComponent } from '@/app/modules/status/widgets/child-bridge-widget/child-bridge-widget.component'
import { ClockWidgetComponent } from '@/app/modules/status/widgets/clock-widget/clock-widget.component'
import { CpuWidgetComponent } from '@/app/modules/status/widgets/cpu-widget/cpu-widget.component'
import { HapQrcodeWidgetComponent } from '@/app/modules/status/widgets/hap-qrcode-widget/hap-qrcode-widget.component'
import { HomebridgeLogsWidgetComponent } from '@/app/modules/status/widgets/homebridge-logs-widget/homebridge-logs-widget.component'
import { HomebridgeStatusWidgetComponent } from '@/app/modules/status/widgets/homebridge-status-widget/homebridge-status-widget.component'
import { MemoryWidgetComponent } from '@/app/modules/status/widgets/memory-widget/memory-widget.component'
import { NetworkWidgetComponent } from '@/app/modules/status/widgets/network-widget/network-widget.component'
import { SystemInfoWidgetComponent } from '@/app/modules/status/widgets/system-info-widget/system-info-widget.component'
import { TerminalWidgetComponent } from '@/app/modules/status/widgets/terminal-widget/terminal-widget.component'
import { UptimeWidgetComponent } from '@/app/modules/status/widgets/uptime-widget/uptime-widget.component'
import { WeatherWidgetComponent } from '@/app/modules/status/widgets/weather-widget/weather-widget.component'
import { WidgetsComponent } from '@/app/modules/status/widgets/widgets.component'
import { WidgetsAddComponent } from '@/app/modules/status/widgets-add/widgets-add.component'
import { WidgetsControlComponent } from '@/app/modules/status/widgets-control/widgets-control.component'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import { TranslateModule } from '@ngx-translate/core'
import { GridsterModule } from 'angular-gridster2'
import { NgChartsModule } from 'ng2-charts'
import { DragulaModule } from 'ng2-dragula'

@NgModule({
  declarations: [
    StatusComponent,
    WidgetsComponent,
    WidgetsAddComponent,
    WidgetsControlComponent,
    HapQrcodeWidgetComponent,
    HomebridgeLogsWidgetComponent,
    TerminalWidgetComponent,
    CpuWidgetComponent,
    MemoryWidgetComponent,
    NetworkWidgetComponent,
    UptimeWidgetComponent,
    HomebridgeStatusWidgetComponent,
    SystemInfoWidgetComponent,
    WeatherWidgetComponent,
    AccessoriesWidgetComponent,
    ClockWidgetComponent,
    ChildBridgeWidgetComponent,
    CreditsComponent,
  ],
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule.forChild(),
    NgbModule,
    GridsterModule,
    DragulaModule,
    NgChartsModule,
    CoreModule,
    AccessoriesCoreModule,
    ManagePluginsModule,
  ],
})
export class StatusModule {}
