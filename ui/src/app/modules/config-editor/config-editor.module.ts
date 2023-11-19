import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';
import { MonacoEditorModule } from 'ngx-monaco-editor';
import { ConfigEditorRoutingModule } from './config-editor-routing.module';
import { ConfigEditorComponent } from './config-editor.component';
import { ConfigEditorResolver } from './config-editor.resolver';
import { ConfigRestoreBackupComponent } from './config-restore-backup/config.restore-backup.component';

@NgModule({
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
