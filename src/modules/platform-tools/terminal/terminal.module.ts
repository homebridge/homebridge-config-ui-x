import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'

import { ConfigModule } from '../../../core/config/config.module.js'
import { LoggerModule } from '../../../core/logger/logger.module.js'
import { NodePtyModule } from '../../../core/node-pty/node-pty.module.js'
import { TerminalController } from './terminal.controller.js'
import { TerminalGateway } from './terminal.gateway.js'
import { TerminalService } from './terminal.service.js'

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ConfigModule,
    LoggerModule,
    NodePtyModule,
  ],
  controllers: [
    TerminalController,
  ],
  providers: [
    TerminalService,
    TerminalGateway,
  ],
})
export class TerminalModule {}
