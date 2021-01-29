import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { Bootstrap4FrameworkModule } from '@oznu/ngx-bs4-jsonform';

import { SpinnerComponent } from './components/spinner/spinner.component';
import { ConvertTempPipe } from './pipes/convert-temp.pipe';
import { ReplacePipe } from './pipes/replace.pipe';
import { ExternalLinkIconPipe } from './pipes/external-link-icon.pipe';
import { HrefTargetBlankDirective } from './directives/href-target-blank.directive';
import { LongClickDirective } from './directives/longclick.directive';
import { BackupRestoreComponent } from './backup-restore/backup-restore.component';
import { ScheduledBackupsComponent } from './backup-restore/scheduled-backups/scheduled-backups.component';
import { ConfirmComponent } from './components/confirm/confirm.component';
import { SchemaFormComponent } from './components/schema-form/schema-form.component';
import { QrcodeComponent } from './components/qrcode/qrcode.component';

@NgModule({
  entryComponents: [
    BackupRestoreComponent,
    ScheduledBackupsComponent,
    ConfirmComponent,
  ],
  declarations: [
    SpinnerComponent,
    SchemaFormComponent,
    ConvertTempPipe,
    ReplacePipe,
    ExternalLinkIconPipe,
    HrefTargetBlankDirective,
    LongClickDirective,
    BackupRestoreComponent,
    ScheduledBackupsComponent,
    ConfirmComponent,
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
    HrefTargetBlankDirective,
    LongClickDirective,
  ],
})
export class CoreModule { }
