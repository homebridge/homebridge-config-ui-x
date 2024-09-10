import { UseGuards } from '@nestjs/common'

import { SubscribeMessage, WebSocketGateway } from '@nestjs/websockets'
import type { EventEmitter } from 'node:events'

import { WsGuard } from '../../core/auth/guards/ws.guard'
import { LogService, LogTermSize } from './log.service'

@UseGuards(WsGuard)
@WebSocketGateway({
  namespace: 'log',
  allowEIO3: true,
  cors: {
    origin: ['http://localhost:8080', 'http://localhost:4200'],
    credentials: true,
  },
})
export class LogGateway {
  constructor(
    private logService: LogService,
  ) {}

  @SubscribeMessage('tail-log')
  connect(client: EventEmitter, payload: LogTermSize) {
    this.logService.connect(client, payload)
  }
}
