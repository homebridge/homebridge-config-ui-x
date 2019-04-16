import { SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { WsGuard } from '../../core/auth/guards/ws.guard';
import { UseGuards } from '@nestjs/common';
import { LogService } from './log.service';

@UseGuards(WsGuard)
@WebSocketGateway({ namespace: 'log' })
export class LogGateway {
  constructor(
    private logService: LogService,
  ) { }

  @SubscribeMessage('tail-log')
  connect(client: any, payload: any) {
    this.logService.connect(client, payload);
  }
}
