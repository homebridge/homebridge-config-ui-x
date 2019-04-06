import { SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { WsAdminGuard } from '../../core/auth/guards/ws-admin-guard';
import { UseGuards } from '@nestjs/common';
import { LogService } from './log.service';

@UseGuards(WsAdminGuard)
@WebSocketGateway({ namespace: 'log' })
export class LogGateway {
  constructor(
    private logService: LogService,
  ) { }

  @SubscribeMessage('tail-log')
  connect(client: any, payload: any) {
    this.logService.connect(client)
  }
}
