import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';
import { GridsterModule } from 'angular-gridster2';

import { CoreModule } from '../../core/core.module';
import { StatusComponent } from './status.component';
import { ManagePluginsModule } from '../../core/manage-plugins/manage-plugins.module';

import { WidgetsComponent } from './widgets/widgets.component';
import { WidgetControlComponent } from './widget-control/widget-control.component';
import { HapQrcodeWidgetComponent } from './widgets/hap-qrcode-widget/hap-qrcode-widget.component';
import { HomebridgeLogsWidgetComponent } from './widgets/homebridge-logs-widget/homebridge-logs-widget.component';
import { TerminalWidgetComponent } from './widgets/terminal-widget/terminal-widget.component';
import { CpuWidgetComponent } from './widgets/cpu-widget/cpu-widget.component';
import { MemoryWidgetComponent } from './widgets/memory-widget/memory-widget.component';
import { UptimeWidgetComponent } from './widgets/uptime-widget/uptime-widget.component';
import { HomebridgeStatusWidgetComponent } from './widgets/homebridge-status-widget/homebridge-status-widget.component';
import { SystemInfoWidgetComponent } from './widgets/system-info-widget/system-info-widget.component';

@NgModule({
  entryComponents: [
    WidgetControlComponent,
    HapQrcodeWidgetComponent,
    HomebridgeLogsWidgetComponent,
    TerminalWidgetComponent,
    CpuWidgetComponent,
    MemoryWidgetComponent,
    UptimeWidgetComponent,
    HomebridgeStatusWidgetComponent,
    SystemInfoWidgetComponent,
  ],
  declarations: [
    StatusComponent,
    WidgetsComponent,
    WidgetControlComponent,
    HapQrcodeWidgetComponent,
    HomebridgeLogsWidgetComponent,
    TerminalWidgetComponent,
    CpuWidgetComponent,
    MemoryWidgetComponent,
    UptimeWidgetComponent,
    HomebridgeStatusWidgetComponent,
    SystemInfoWidgetComponent,
  ],
  imports: [
    CommonModule,
    RouterModule,
    TranslateModule.forChild(),
    NgbModule,
    GridsterModule,
    CoreModule,
    ManagePluginsModule,
  ],
})
export class StatusModule { }
