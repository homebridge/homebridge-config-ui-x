import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';
import { NgxMdModule } from 'ngx-md';
import { Bootstrap4FrameworkModule } from '@oznu/ngx-bs4-jsonform';

import { CoreModule } from '../core.module';
import { InterpolateMdPipe } from './interpolate-md.pipe';
import { ManagePluginsService } from './manage-plugins.service';
import { SettingsPluginsModalComponent } from './settings-plugins-modal/settings-plugins-modal.component';
import { ManagePluginsModalComponent } from './manage-plugins-modal/manage-plugins-modal.component';
import { CustomPluginsModule } from './custom-plugins/custom-plugins.module';
import { UninstallPluginsModalComponent } from './uninstall-plugins-modal/uninstall-plugins-modal.component';
import { NodeUpdateRequiredModalComponent } from './node-update-required-modal/node-update-required-modal.component';

@NgModule({
  entryComponents: [
    SettingsPluginsModalComponent,
    ManagePluginsModalComponent,
    UninstallPluginsModalComponent,
    NodeUpdateRequiredModalComponent,
  ],
  declarations: [
    SettingsPluginsModalComponent,
    ManagePluginsModalComponent,
    UninstallPluginsModalComponent,
    NodeUpdateRequiredModalComponent,
    InterpolateMdPipe,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule.forChild(),
    NgbModule,
    NgxMdModule,
    Bootstrap4FrameworkModule,
    CoreModule,
    CustomPluginsModule,
  ],
  providers: [
    ManagePluginsService,
  ],
})
export class ManagePluginsModule { }
