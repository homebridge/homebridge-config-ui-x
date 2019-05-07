import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';
import { NgxMdModule } from 'ngx-md';
import { Bootstrap4FrameworkModule } from '@oznu/ngx-bs4-jsonform';

import { CoreModule } from '../core.module';
import { ManagePluginsService } from './manage-plugins.service';
import { SettingsPluginsModalComponent } from './settings-plugins-modal/settings-plugins-modal.component';
import { ManagePluginsModalComponent } from './manage-plugins-modal/manage-plugins-modal.component';

@NgModule({
  entryComponents: [
    SettingsPluginsModalComponent,
    ManagePluginsModalComponent,
  ],
  declarations: [
    SettingsPluginsModalComponent,
    ManagePluginsModalComponent,
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
  ],
  providers: [
    ManagePluginsService,
  ],
})
export class ManagePluginsModule { }
