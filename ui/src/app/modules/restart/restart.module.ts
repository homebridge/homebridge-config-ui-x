import { RestartComponent } from '@/app/modules/restart/restart.component'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'

@NgModule({
  imports: [
    CommonModule,
    TranslateModule.forChild(),
    RestartComponent,
  ],
})
export class RestartModule {}
