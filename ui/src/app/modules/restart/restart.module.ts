import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { RestartRoutingModule } from './restart-routing.module';
import { RestartComponent } from './restart.component';
import { CoreModule } from 'src/app/core/core.module';

@NgModule({
  declarations: [
    RestartComponent,
  ],
  imports: [
    CommonModule,
    CoreModule,
    RestartRoutingModule,
  ],
})
export class RestartModule { }
