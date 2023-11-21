import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { LogsRoutingModule } from './logs-routing.module';
import { LogsComponent } from './logs.component';

@NgModule({
  declarations: [
    LogsComponent,
  ],
  imports: [
    CommonModule,
    LogsRoutingModule,
    NgbModule,
  ],
})
export class LogsModule {}
