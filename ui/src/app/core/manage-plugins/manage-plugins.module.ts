import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';
import { NgxMdModule } from 'ngx-md';

import {
  JsonSchemaFormModule,
  Bootstrap4FrameworkModule,
  Bootstrap4Framework,
  Framework,
  WidgetLibraryService,
  FrameworkLibraryService,
  JsonSchemaFormService,
} from 'ngx-json-schema';

import { CoreModule } from '../core.module';
import { ManagePluginsService } from './manage-plugins.service';
import { SettingsPluginsModalComponent } from './settings-plugins-modal/settings-plugins-modal.component';
import { ManagePluginsModalComponent } from './manage-plugins-modal/manage-plugins-modal.component';

@NgModule({
  entryComponents: [
    SettingsPluginsModalComponent,
    ManagePluginsModalComponent
  ],
  declarations: [
    SettingsPluginsModalComponent,
    ManagePluginsModalComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule.forChild(),
    NgbModule,
    NgxMdModule,
    Bootstrap4FrameworkModule,
    {
      ngModule: JsonSchemaFormModule,
      providers: [
        JsonSchemaFormService,
        FrameworkLibraryService,
        WidgetLibraryService,
        { provide: Framework, useClass: Bootstrap4Framework, multi: true }
      ]
    },
    CoreModule,
  ],
  providers: [
    ManagePluginsService,
  ]
})
export class ManagePluginsModule { }
