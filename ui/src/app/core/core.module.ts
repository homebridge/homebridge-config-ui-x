import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SpinnerComponent } from './components/spinner/spinner.component';
import { ConvertTempPipe } from './pipes/convert-temp.pipe';
import { HrefTargetBlankDirective } from './directives/href-target-blank.directive';
import { LongClickDirective } from './directives/longclick.directive';

@NgModule({
  declarations: [
    SpinnerComponent,
    ConvertTempPipe,
    HrefTargetBlankDirective,
    LongClickDirective,
  ],
  imports: [
    CommonModule,
  ],
  providers: [],
  exports: [
    SpinnerComponent,
    ConvertTempPipe,
    HrefTargetBlankDirective,
    LongClickDirective
  ]
})
export class CoreModule { }
