import { LogsRoutingModule } from '@/app/modules/logs/logs-routing.module'
import { LogsComponent } from '@/app/modules/logs/logs.component'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import { TranslateModule } from '@ngx-translate/core'

@NgModule({
  imports: [
    CommonModule,
    LogsRoutingModule,
    NgbModule,
    TranslateModule.forChild(),
    LogsComponent,
  ],
})
export class LogsModule {}
