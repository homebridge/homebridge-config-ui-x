import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ConvertTempPipe } from './convert-temp.pipe';

@NgModule({
  imports: [
    CommonModule,
  ],
  declarations: [
    ConvertTempPipe
  ],
  exports: [
    ConvertTempPipe
  ]
})
export class CustomPipesModule { }
