import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';
import { NgxMdModule } from 'ngx-md';
import { MonacoEditorModule } from 'ngx-monaco-editor';
import { BridgePluginsModalComponent } from './bridge-plugins-modal/bridge-plugins-modal.component';
import { CustomPluginsModule } from './custom-plugins/custom-plugins.module';
import { InterpolateMdPipe } from './interpolate-md.pipe';
import { ManagePluginsModalComponent } from './manage-plugins-modal/manage-plugins-modal.component';
import { ManagePluginsService } from './manage-plugins.service';
import { ManualPluginConfigModalComponent } from './manual-plugin-config-modal/manual-plugin-config-modal.component';
import { NodeUpdateRequiredModalComponent } from './node-update-required-modal/node-update-required-modal.component';
import { SelectPreviousVersionComponent } from './select-previous-version/select-previous-version.component';
import { SettingsPluginsModalComponent } from './settings-plugins-modal/settings-plugins-modal.component';
import { UninstallPluginsModalComponent } from './uninstall-plugins-modal/uninstall-plugins-modal.component';
import { CoreModule } from '@/app/core/core.module';
import { PluginLogModalComponent } from '@/app/core/manage-plugins/plugin-log-modal/plugin-log-modal.component';

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
