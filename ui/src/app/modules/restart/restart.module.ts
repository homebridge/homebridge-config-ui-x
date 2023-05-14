import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

import { CoreModule } from '@/app/core/core.module';
import { RestartComponent } from './restart.component';

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
export class RestartModule { }
