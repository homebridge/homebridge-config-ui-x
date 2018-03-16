import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TerminalComponent } from './terminal.component';

@NgModule({
  imports: [
    CommonModule
  ],
  declarations: [
    TerminalComponent
  ],
  exports: [
    TerminalComponent
  ]
})
export class TerminalModule { }
