import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PlatformToolsRoutingModule } from './platform-tools-routing.module';
import { PlatformToolsComponent } from './platform-tools.component';

@NgModule({
  declarations: [
    PlatformToolsComponent
  ],
  imports: [
    CommonModule,
    PlatformToolsRoutingModule
  ]
})
export class PlatformToolsModule { }
