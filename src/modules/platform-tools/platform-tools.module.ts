import { Module } from '@nestjs/common'

import { DockerModule } from './docker/docker.module.js'
import { HbServiceModule } from './hb-service/hb-service.module.js'
import { LinuxModule } from './linux/linux.module.js'
import { TerminalModule } from './terminal/terminal.module.js'

@Module({
  imports: [
    TerminalModule,
    LinuxModule,
    DockerModule,
    HbServiceModule,
  ],
})
export class PlatformToolsModule {}
