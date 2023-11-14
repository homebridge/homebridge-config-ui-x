import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { Bootstrap4FrameworkModule } from '@oznu/ngx-bs4-jsonform';
import { BackupRestoreComponent } from './backup-restore/backup-restore.component';
import { ScheduledBackupsComponent } from './backup-restore/scheduled-backups/scheduled-backups.component';
import { ConfirmComponent } from './components/confirm/confirm.component';
import { QrcodeComponent } from './components/qrcode/qrcode.component';
import { SchemaFormComponent } from './components/schema-form/schema-form.component';
import { SpinnerComponent } from './components/spinner/spinner.component';
import { JsonSchemaFormPatchDirective } from './directives/json-schema-form-patch.directive';
import { LongClickDirective } from './directives/longclick.directive';
import { PluginsMarkdownDirective } from './directives/plugins.markdown.directive';
import { RtlDirective } from './directives/rtl.directive';
import { ConvertTempPipe } from './pipes/convert-temp.pipe';
import { ExternalLinkIconPipe } from './pipes/external-link-icon.pipe';
import { ReplacePipe } from './pipes/replace.pipe';
import { InformationComponent } from '@/app/core/components/information/information.component';

@NgModule({
    declarations: [
        SpinnerComponent,
        SchemaFormComponent,
        ConvertTempPipe,
        ReplacePipe,
        ExternalLinkIconPipe,
        PluginsMarkdownDirective,
        LongClickDirective,
        RtlDirective,
        JsonSchemaFormPatchDirective,
        BackupRestoreComponent,
        ScheduledBackupsComponent,
        ConfirmComponent,
        InformationComponent,
        QrcodeComponent,
    ],
    imports: [
        CommonModule,
        TranslateModule,
        Bootstrap4FrameworkModule,
    ],
    providers: [],
    exports: [
        SpinnerComponent,
        SchemaFormComponent,
        QrcodeComponent,
        ConvertTempPipe,
        ReplacePipe,
        ExternalLinkIconPipe,
        PluginsMarkdownDirective,
        LongClickDirective,
        RtlDirective,
        JsonSchemaFormPatchDirective,
    ],
})
export class CoreModule { }
