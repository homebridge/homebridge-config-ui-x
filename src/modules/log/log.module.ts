import { Module } from '@nestjs/common'

import { ConfigModule } from '../../core/config/config.module.js'
import { LoggerModule } from '../../core/logger/logger.module.js'
import { NodePtyModule } from '../../core/node-pty/node-pty.module.js'
import { LogGateway } from './log.gateway.js'
import { LogService } from './log.service.js'

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    NodePtyModule,
  ],
  providers: [
    LogService,
    LogGateway,
  ],
})
export class LogModule {}
