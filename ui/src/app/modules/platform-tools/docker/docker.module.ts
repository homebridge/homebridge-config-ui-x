import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { DockerRoutingModule } from './docker-routing.module';
import { DockerComponent } from './docker.component';

@NgModule({
  declarations: [DockerComponent],
  imports: [
    CommonModule,
    DockerRoutingModule
  ]
})
export class DockerModule { }
