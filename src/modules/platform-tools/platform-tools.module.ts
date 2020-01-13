import { Module } from '@nestjs/common';
import { LinuxModule } from './linux/linux.module';
import { DockerModule } from './docker/docker.module';
import { TerminalModule } from './terminal/terminal.module';
import { HbServiceModule } from './hb-service/hb-service.module';

@Module({
  imports: [
    TerminalModule,
    LinuxModule,
    DockerModule,
    HbServiceModule,
  ],
})
export class PlatformToolsModule { }
