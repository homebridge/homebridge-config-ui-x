import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { RestartComponent } from './restart.component';
import { CoreModule } from '@/app/core/core.module';

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
