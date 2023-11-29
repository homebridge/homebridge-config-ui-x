import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { TerminalRoutingModule } from './terminal-routing.module';
import { TerminalComponent } from './terminal.component';

@NgModule({
  declarations: [
    TerminalComponent,
  ],
  imports: [
    CommonModule,
    TerminalRoutingModule,
    TranslateModule.forChild(),
  ],
})
export class TerminalModule {}
