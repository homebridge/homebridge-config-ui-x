import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { CoreModule } from '@/app/core/core.module';
import { RestartComponent } from '@/app/modules/restart/restart.component';

@NgModule({
  declarations: [
    RestartComponent,
  ],
  imports: [
    CommonModule,
    TranslateModule.forChild(),
    CoreModule,
  ],
})
export class RestartModule {}
