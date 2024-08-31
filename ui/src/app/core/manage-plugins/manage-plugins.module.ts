import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';
import { NgxMdModule } from 'ngx-md';
import { MonacoEditorModule } from 'ngx-monaco-editor';
import { CoreModule } from '@/app/core/core.module';
import { CustomPluginsModule } from '@/app/core/manage-plugins/custom-plugins/custom-plugins.module';
import { DonateComponent } from '@/app/core/manage-plugins/donate/donate.component';
import { InterpolateMdPipe } from '@/app/core/manage-plugins/interpolate-md.pipe';
import { ManagePluginComponent } from '@/app/core/manage-plugins/manage-plugin/manage-plugin.component';
import { ManagePluginsService } from '@/app/core/manage-plugins/manage-plugins.service';
import { ManageVersionComponent } from '@/app/core/manage-plugins/manage-version/manage-version.component';
import { ManualConfigComponent } from '@/app/core/manage-plugins/manual-config/manual-config.component'; // eslint-disable-line max-len
import { NodeUpdateRequiredComponent } from '@/app/core/manage-plugins/node-update-required/node-update-required.component'; // eslint-disable-line max-len
import { PluginBridgeComponent } from '@/app/core/manage-plugins/plugin-bridge/plugin-bridge.component';
import { PluginConfigComponent } from '@/app/core/manage-plugins/plugin-config/plugin-config.component';
import { PluginLogsComponent } from '@/app/core/manage-plugins/plugin-logs/plugin-logs.component';
import { UninstallPluginComponent } from '@/app/core/manage-plugins/uninstall-plugin/uninstall-plugin.component';

@NgModule({
  declarations: [
    PluginConfigComponent,
    ManagePluginComponent,
    UninstallPluginComponent,
    NodeUpdateRequiredComponent,
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
