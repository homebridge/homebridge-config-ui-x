import type { EventEmitter } from 'node:events'

import type { LogTermSize } from './log.interfaces.js'

import { Inject, UseGuards } from '@nestjs/common'
import { SubscribeMessage, WebSocketGateway } from '@nestjs/websockets'

import { WsGuard } from '../../core/auth/guards/ws.guard.js'
import { LogService } from './log.service.js'

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
    @Inject(LogService) private readonly logService: LogService,
  ) {}

  @SubscribeMessage('tail-log')
  connect(client: EventEmitter, payload: LogTermSize) {
    this.logService.connect(client, payload)
  }
}
