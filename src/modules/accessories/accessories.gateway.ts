import { SubscribeMessage, WebSocketGateway, WsException } from '@nestjs/websockets';
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

  @SubscribeMessage('get-layout')
  async getAccessoryLayout(client: any, payload: any) {
    return await this.accessoriesService.getAccessoryLayout(payload.user);
  }

  @SubscribeMessage('save-layout')
  async saveAccessoryLayout(client: any, payload: any) {
    try {
      return await this.accessoriesService.saveAccessoryLayout(payload.user, payload.layout);
    } catch (e) {
      return new WsException(e);
    }
  }
}
