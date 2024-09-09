import { CoreModule } from '@/app/core/core.module'
import { CustomPluginsModule } from '@/app/core/manage-plugins/custom-plugins/custom-plugins.module'
import { DonateComponent } from '@/app/core/manage-plugins/donate/donate.component'
import { InterpolateMdPipe } from '@/app/core/manage-plugins/interpolate-md.pipe'
import { ManagePluginComponent } from '@/app/core/manage-plugins/manage-plugin/manage-plugin.component'
import { ManagePluginsService } from '@/app/core/manage-plugins/manage-plugins.service'
import { ManageVersionComponent } from '@/app/core/manage-plugins/manage-version/manage-version.component'
import { ManualConfigComponent } from '@/app/core/manage-plugins/manual-config/manual-config.component'
import { PluginBridgeComponent } from '@/app/core/manage-plugins/plugin-bridge/plugin-bridge.component'
import { PluginCompatibilityComponent } from '@/app/core/manage-plugins/plugin-compatibility/plugin-compatibility.component'
import { PluginConfigComponent } from '@/app/core/manage-plugins/plugin-config/plugin-config.component'
import { PluginLogsComponent } from '@/app/core/manage-plugins/plugin-logs/plugin-logs.component'
import { UninstallPluginComponent } from '@/app/core/manage-plugins/uninstall-plugin/uninstall-plugin.component'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import { TranslateModule } from '@ngx-translate/core'
import { NgxMdModule } from 'ngx-md'
import { MonacoEditorModule } from 'ngx-monaco-editor'

@NgModule({
  declarations: [
    PluginConfigComponent,
    ManagePluginComponent,
    UninstallPluginComponent,
    PluginCompatibilityComponent,
    InterpolateMdPipe,
    ManualConfigComponent,
    ManageVersionComponent,
    PluginBridgeComponent,
    PluginLogsComponent,
    DonateComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule.forChild(),
    NgbModule,
    NgxMdModule,
    MonacoEditorModule,
    NgbModule,
    CoreModule,
    CustomPluginsModule,
  ],
  providers: [
    ManagePluginsService,
  ],
})
export class ManagePluginsModule {}
