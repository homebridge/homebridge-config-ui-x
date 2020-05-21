import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SpinnerComponent } from './components/spinner/spinner.component';
import { ConvertTempPipe } from './pipes/convert-temp.pipe';
import { ReplacePipe } from './pipes/replace.pipe';
import { HrefTargetBlankDirective } from './directives/href-target-blank.directive';
import { LongClickDirective } from './directives/longclick.directive';
import { TranslateModule } from '@ngx-translate/core';
import { BackupRestoreComponent } from './backup-restore/backup-restore.component';
import { ConfirmComponent } from './components/confirm/confirm.component';

@NgModule({
  entryComponents: [
    BackupRestoreComponent,
    ConfirmComponent,
  ],
  declarations: [
    SpinnerComponent,
    ConvertTempPipe,
    ReplacePipe,
    HrefTargetBlankDirective,
    LongClickDirective,
    BackupRestoreComponent,
    ConfirmComponent,
  ],
  imports: [
    CommonModule,
    TranslateModule,
  ],
  providers: [],
  exports: [
    SpinnerComponent,
    ConvertTempPipe,
    ReplacePipe,
    HrefTargetBlankDirective,
    LongClickDirective,
  ],
})
export class CoreModule { }
