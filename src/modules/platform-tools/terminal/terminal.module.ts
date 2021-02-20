import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { TerminalService } from './terminal.service';
import { TerminalGateway } from './terminal.gateway';
import { ConfigModule } from '../../../core/config/config.module';
import { LoggerModule } from '../../../core/logger/logger.module';
import { NodePtyModule } from '../../../core/node-pty/node-pty.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ConfigModule,
    LoggerModule,
    NodePtyModule,
  ],
  providers: [
    TerminalService,
    TerminalGateway,
  ],
})
export class TerminalModule { }
