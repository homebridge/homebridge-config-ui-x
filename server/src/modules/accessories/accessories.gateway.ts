import { SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { WsJwtGuard } from '../../core/auth/ws-jwt.guard';
import { AccessoriesService } from './accessories.service';

@UseGuards(WsJwtGuard)
@WebSocketGateway({ namespace: 'accessories' })
export class AccessoriesGateway {
  constructor(
    private accessoriesService: AccessoriesService
  ) { }

  @SubscribeMessage('get-accessories')
  connect(client: any, payload: any) {
    this.accessoriesService.connect(client);
  }
}
