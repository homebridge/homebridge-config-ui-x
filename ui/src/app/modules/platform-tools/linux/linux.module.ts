import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { LinuxRoutingModule } from './linux-routing.module';
import { LinuxComponent } from './linux.component';

@NgModule({
  declarations: [LinuxComponent],
  imports: [
    CommonModule,
    LinuxRoutingModule
  ]
})
export class LinuxModule { }
