import { Module } from '@nestjs/common'

import { DockerModule } from './docker/docker.module'
import { HbServiceModule } from './hb-service/hb-service.module'
import { LinuxModule } from './linux/linux.module'
import { TerminalModule } from './terminal/terminal.module'

@Module({
  imports: [
    TerminalModule,
    LinuxModule,
    DockerModule,
    HbServiceModule,
  ],
})
export class PlatformToolsModule {}
