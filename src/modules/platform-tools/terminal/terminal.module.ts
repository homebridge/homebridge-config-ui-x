import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'

import { ConfigModule } from '../../../core/config/config.module'
import { LoggerModule } from '../../../core/logger/logger.module'
import { NodePtyModule } from '../../../core/node-pty/node-pty.module'
import { TerminalController } from './terminal.controller'
import { TerminalGateway } from './terminal.gateway'
import { TerminalService } from './terminal.service'

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
