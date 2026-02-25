import type { EventEmitter } from 'node:events'

import { Inject, UseGuards } from '@nestjs/common'
import { SubscribeMessage, WebSocketGateway } from '@nestjs/websockets'

import { WsGuard } from '../../core/auth/guards/ws.guard.js'
import { devServerCorsConfig } from '../../core/cors.config.js'
import { TermSize } from '../platform-tools/terminal/terminal.interfaces.js'
import { LogService } from './log.service.js'

@UseGuards(WsGuard)
@WebSocketGateway({
  namespace: 'log',
  allowEIO3: true,
  cors: devServerCorsConfig,
})
export class LogGateway {
  constructor(
    @Inject(LogService) private readonly logService: LogService,
  ) {}

  @SubscribeMessage('tail-log')
  connect(client: EventEmitter, payload: TermSize) {
    this.logService.connect(client, payload)
  }
}
