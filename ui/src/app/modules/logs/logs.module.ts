import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { LogsRoutingModule } from './logs-routing.module';
import { LogsComponent } from './logs.component';

@NgModule({
  declarations: [
    LogsComponent
  ],
  imports: [
    CommonModule,
    LogsRoutingModule
  ]
})
export class LogsModule { }
