import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';
import { GridsterModule } from 'angular-gridster2';
import { NgChartsModule } from 'ng2-charts';
import { DragulaModule } from 'ng2-dragula';
import { StatusComponent } from './status.component';
import { WidgetAddComponent } from './widget-add/widget-add.component';
import { WidgetControlComponent } from './widget-control/widget-control.component';
import { AccessoriesWidgetComponent } from './widgets/accessories-widget/accessories-widget.component';
import { ChildBridgeWidgetComponent } from './widgets/child-bridge-widget/child-bridge-widget.component';
import { ClockWidgetComponent } from './widgets/clock-widget/clock-widget.component';
import { CpuWidgetComponent } from './widgets/cpu-widget/cpu-widget.component';
import { HapQrcodeWidgetComponent } from './widgets/hap-qrcode-widget/hap-qrcode-widget.component';
import { HomebridgeLogsWidgetComponent } from './widgets/homebridge-logs-widget/homebridge-logs-widget.component';
import { HomebridgeStatusWidgetComponent } from './widgets/homebridge-status-widget/homebridge-status-widget.component';
import { MemoryWidgetComponent } from './widgets/memory-widget/memory-widget.component';
import { NetworkWidgetComponent } from './widgets/network-widget/network-widget.component';
import { SystemInfoWidgetComponent } from './widgets/system-info-widget/system-info-widget.component';
import { TerminalWidgetComponent } from './widgets/terminal-widget/terminal-widget.component';
import { UptimeWidgetComponent } from './widgets/uptime-widget/uptime-widget.component';
import { WeatherWidgetComponent } from './widgets/weather-widget/weather-widget.component';
import { WidgetsComponent } from './widgets/widgets.component';
import { AccessoriesCoreModule } from '@/app/core/accessories/accessories.module';
import { CoreModule } from '@/app/core/core.module';
import { ManagePluginsModule } from '@/app/core/manage-plugins/manage-plugins.module';

@NgModule({
  declarations: [
    StatusComponent,
    WidgetsComponent,
    WidgetAddComponent,
    WidgetControlComponent,
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
