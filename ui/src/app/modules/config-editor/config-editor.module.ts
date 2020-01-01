import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { MonacoEditorModule } from 'ngx-monaco-editor';

import { ConfigEditorRoutingModule } from './config-editor-routing.module';
import { ConfigRestoreBackupComponent } from './config-restore-backup/config.restore-backup.component';
import { ConfigEditorComponent } from './config-editor.component';
import { ConfigEditorResolver } from './config-editor.resolver';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

@NgModule({
  entryComponents: [
    ConfigRestoreBackupComponent,
  ],
  declarations: [
    ConfigEditorComponent,
    ConfigRestoreBackupComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MonacoEditorModule,
    NgbModule,
    TranslateModule.forChild(),
    ConfigEditorRoutingModule,
  ],
  providers: [
    ConfigEditorResolver,
  ],
})
export class ConfigEditorModule { }
