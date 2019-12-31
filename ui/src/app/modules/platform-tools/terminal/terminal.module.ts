import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TerminalRoutingModule } from './terminal-routing.module';
import { TerminalComponent } from './terminal.component';

@NgModule({
  declarations: [
    TerminalComponent,
  ],
  imports: [
    CommonModule,
    TerminalRoutingModule,
  ],
})
export class TerminalModule { }
