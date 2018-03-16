import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TerminalModule } from './terminal/terminal.module';
import { DockerToolsModule } from './docker/docker.module';
import { LinuxToolsModule } from './linux/linux.module';

@NgModule({
  imports: [
    CommonModule,
    TerminalModule,
    DockerToolsModule,
    LinuxToolsModule
  ],
  exports: [
  ]
})
export class PlatformToolsModule { }
