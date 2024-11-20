import { CustomPluginsModule } from '@/app/core/manage-plugins/custom-plugins/custom-plugins.module'
import { DisablePluginComponent } from '@/app/core/manage-plugins/disable-plugin/disable-plugin.component'
import { DonateComponent } from '@/app/core/manage-plugins/donate/donate.component'
import { HbUpdateConfirmComponent } from '@/app/core/manage-plugins/hb-update-confirm/hb-update-confirm.component'
import { InterpolateMdPipe } from '@/app/core/manage-plugins/interpolate-md.pipe'
import { ManagePluginComponent } from '@/app/core/manage-plugins/manage-plugin/manage-plugin.component'
import { ManagePluginsService } from '@/app/core/manage-plugins/manage-plugins.service'
import { ManageVersionComponent } from '@/app/core/manage-plugins/manage-version/manage-version.component'
import { ManualConfigComponent } from '@/app/core/manage-plugins/manual-config/manual-config.component'
import { PluginBridgeComponent } from '@/app/core/manage-plugins/plugin-bridge/plugin-bridge.component'
import { PluginCompatibilityComponent } from '@/app/core/manage-plugins/plugin-compatibility/plugin-compatibility.component'
import { PluginConfigComponent } from '@/app/core/manage-plugins/plugin-config/plugin-config.component'
import { PluginLogsComponent } from '@/app/core/manage-plugins/plugin-logs/plugin-logs.component'
import { ResetAccessoriesComponent } from '@/app/core/manage-plugins/reset-accessories/reset-accessories.component'
import { SwitchToScopedComponent } from '@/app/core/manage-plugins/switch-to-scoped/switch-to-scoped.component'
import { UninstallPluginComponent } from '@/app/core/manage-plugins/uninstall-plugin/uninstall-plugin.component'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import { TranslateModule } from '@ngx-translate/core'
import { NgxMdModule } from 'ngx-md'
import { MonacoEditorModule } from 'ngx-monaco-editor-v2'

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule.forChild(),
    NgbModule,
    NgxMdModule,
    MonacoEditorModule,
    NgbModule,
    CustomPluginsModule,
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
    ResetAccessoriesComponent,
    DisablePluginComponent,
    HbUpdateConfirmComponent,
    SwitchToScopedComponent,
  ],
  providers: [
    ManagePluginsService,
  ],
})
export class ManagePluginsModule {}
