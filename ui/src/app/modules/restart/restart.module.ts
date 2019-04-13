import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { RestartComponent } from './restart.component';
import { CoreModule } from 'src/app/core/core.module';

@NgModule({
  declarations: [
    RestartComponent,
  ],
  imports: [
    CommonModule,
    CoreModule,
  ],
})
export class RestartModule { }
