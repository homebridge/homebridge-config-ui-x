import { UseGuards } from '@nestjs/common'
import { SubscribeMessage, WebSocketGateway } from '@nestjs/websockets'

import { WsAdminGuard } from '../../../core/auth/guards/ws-admin-guard'
import { TerminalService, TermSize, WsEventEmitter } from './terminal.service'

@UseGuards(WsAdminGuard)
@WebSocketGateway({
  namespace: 'platform-tools/terminal',
  allowEIO3: true,
  cors: {
    origin: ['http://localhost:8080', 'http://localhost:4200'],
    credentials: true,
  },
})
export class TerminalGateway {
  constructor(
    private readonly terminalService: TerminalService,
  ) {}

  @SubscribeMessage('start-session')
  startTerminalSession(client: WsEventEmitter, payload: TermSize) {
    return this.terminalService.startSession(client, payload)
  }
}
