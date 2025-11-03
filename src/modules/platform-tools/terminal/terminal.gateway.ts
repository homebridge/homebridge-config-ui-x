import type { TermSize, WsEventEmitter } from './terminal.interfaces.js'

import { Inject, UseGuards } from '@nestjs/common'
import { SubscribeMessage, WebSocketGateway } from '@nestjs/websockets'

import { WsAdminGuard } from '../../../core/auth/guards/ws-admin-guard.js'
import { TerminalService } from './terminal.service.js'

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
    @Inject(TerminalService) private readonly terminalService: TerminalService,
  ) {}

  @SubscribeMessage('start-session')
  startTerminalSession(client: WsEventEmitter, payload: TermSize) {
    return this.terminalService.startSession(client, payload)
  }

  @SubscribeMessage('destroy-persistent-session')
  destroyPersistentSession() {
    return this.terminalService.destroyPersistentSession()
  }

  @SubscribeMessage('check-persistent-session')
  checkPersistentSession() {
    return this.terminalService.hasPersistentSession()
  }
}
