import { SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { WsAdminGuard } from '../../../core/auth/guards/ws-admin-guard';
import { TerminalService } from './terminal.service';

@UseGuards(WsAdminGuard)
@WebSocketGateway({ namespace: 'platform-tools/terminal' })
export class TerminalGateway {
  constructor(
    private readonly terminalService: TerminalService,
  ) { }

  @SubscribeMessage('start-session')
  startTerminalSession(client: any, payload: any) {
    return this.terminalService.startSession(client, payload);
  }
}
