import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';
import { NgxMdModule } from 'ngx-md';
import { MonacoEditorModule } from 'ngx-monaco-editor';

import { CoreModule } from '../core.module';
import { InterpolateMdPipe } from './interpolate-md.pipe';
import { ManagePluginsService } from './manage-plugins.service';
import { SettingsPluginsModalComponent } from './settings-plugins-modal/settings-plugins-modal.component';
import { ManagePluginsModalComponent } from './manage-plugins-modal/manage-plugins-modal.component';
import { CustomPluginsModule } from './custom-plugins/custom-plugins.module';
import { UninstallPluginsModalComponent } from './uninstall-plugins-modal/uninstall-plugins-modal.component';
import { NodeUpdateRequiredModalComponent } from './node-update-required-modal/node-update-required-modal.component';
import { ManualPluginConfigModalComponent } from './manual-plugin-config-modal/manual-plugin-config-modal.component';
import { SelectPreviousVersionComponent } from './select-previous-version/select-previous-version.component';
import { BridgePluginsModalComponent } from './bridge-plugins-modal/bridge-plugins-modal.component';

@NgModule({
  entryComponents: [
    SettingsPluginsModalComponent,
    ManagePluginsModalComponent,
    UninstallPluginsModalComponent,
    NodeUpdateRequiredModalComponent,
    ManualPluginConfigModalComponent,
    SelectPreviousVersionComponent,
    BridgePluginsModalComponent,
  ],
  declarations: [
    SettingsPluginsModalComponent,
    ManagePluginsModalComponent,
    UninstallPluginsModalComponent,
    NodeUpdateRequiredModalComponent,
    InterpolateMdPipe,
    ManualPluginConfigModalComponent,
    SelectPreviousVersionComponent,
    BridgePluginsModalComponent,
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
export class ManagePluginsModule { }
