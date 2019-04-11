import { Module } from '@nestjs/common';
import { LinuxModule } from './linux/linux.module';
import { DockerModule } from './docker/docker.module';
import { TerminalModule } from './terminal/terminal.module';

@Module({
  imports: [
    TerminalModule,
    LinuxModule,
    DockerModule,
  ],
})
export class PlatformToolsModule { }
