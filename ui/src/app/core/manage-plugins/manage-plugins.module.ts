import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';
import { NgxMdModule } from 'ngx-md';
import { MonacoEditorModule } from 'ngx-monaco-editor';
import { CoreModule } from '@/app/core/core.module';
import { BridgePluginsModalComponent } from '@/app/core/manage-plugins/bridge-plugins-modal/bridge-plugins-modal.component';
import { CustomPluginsModule } from '@/app/core/manage-plugins/custom-plugins/custom-plugins.module';
import { DonateModalComponent } from '@/app/core/manage-plugins/donate-modal/donate-modal.component';
import { InterpolateMdPipe } from '@/app/core/manage-plugins/interpolate-md.pipe';
import { ManagePluginsModalComponent } from '@/app/core/manage-plugins/manage-plugins-modal/manage-plugins-modal.component';
import { ManagePluginsService } from '@/app/core/manage-plugins/manage-plugins.service';
import { ManualPluginConfigModalComponent } from '@/app/core/manage-plugins/manual-plugin-config-modal/manual-plugin-config-modal.component'; // eslint-disable-line max-len
import { NodeUpdateRequiredModalComponent } from '@/app/core/manage-plugins/node-update-required-modal/node-update-required-modal.component'; // eslint-disable-line max-len
import { PluginLogModalComponent } from '@/app/core/manage-plugins/plugin-log-modal/plugin-log-modal.component';
import { SelectPreviousVersionComponent } from '@/app/core/manage-plugins/select-previous-version/select-previous-version.component';
import { SettingsPluginsModalComponent } from '@/app/core/manage-plugins/settings-plugins-modal/settings-plugins-modal.component';
import { UninstallPluginsModalComponent } from '@/app/core/manage-plugins/uninstall-plugins-modal/uninstall-plugins-modal.component';

@NgModule({
  declarations: [
    SettingsPluginsModalComponent,
    ManagePluginsModalComponent,
    UninstallPluginsModalComponent,
    NodeUpdateRequiredModalComponent,
    InterpolateMdPipe,
    ManualPluginConfigModalComponent,
    SelectPreviousVersionComponent,
    BridgePluginsModalComponent,
    PluginLogModalComponent,
    DonateModalComponent,
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
