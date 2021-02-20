import { SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';

import { WsAdminGuard } from '../../../core/auth/guards/ws-admin-guard';
import { TerminalService, WsEventEmitter, TermSize } from './terminal.service';

@UseGuards(WsAdminGuard)
@WebSocketGateway({ namespace: 'platform-tools/terminal' })
export class TerminalGateway {
  constructor(
    private readonly terminalService: TerminalService,
  ) { }

  @SubscribeMessage('start-session')
  startTerminalSession(client: WsEventEmitter, payload: TermSize) {
    return this.terminalService.startSession(client, payload);
  }
}
