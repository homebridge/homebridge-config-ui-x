import { Module } from '@nestjs/common';
import { TerminalService } from './terminal.service';
import { TerminalGateway } from './terminal.gateway';

@Module({
  providers: [TerminalService, TerminalGateway],
})
export class TerminalModule { }
