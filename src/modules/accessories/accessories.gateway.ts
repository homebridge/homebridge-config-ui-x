import { SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { WsGuard } from '../../core/auth/guards/ws.guard';
import { AccessoriesService } from './accessories.service';

@UseGuards(WsGuard)
@WebSocketGateway({ namespace: 'accessories' })
export class AccessoriesGateway {
  constructor(
    private accessoriesService: AccessoriesService,
  ) { }

  @SubscribeMessage('get-accessories')
  connect(client: any, payload: any) {
    this.accessoriesService.connect(client);
  }
}
