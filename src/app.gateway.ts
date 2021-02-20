import { UseGuards } from '@nestjs/common';
import { WebSocketGateway } from '@nestjs/websockets';
import { WsGuard } from './core/auth/guards/ws.guard';

@UseGuards(WsGuard)
@WebSocketGateway({ namespace: 'app' })
export class AppGateway {

}
