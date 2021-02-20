import { SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { WsGuard } from '../../../core/auth/guards/ws.guard';
import { HomebridgeNestCamService } from './homebridge-nest-cam.service';

@UseGuards(WsGuard)
@WebSocketGateway({ namespace: 'plugins/custom-plugins/homebridge-nest-cam' })
export class HomebridgeNestCamGateway {

  constructor(
    private homebridgeNestCamService: HomebridgeNestCamService,
  ) { }

  @SubscribeMessage('link-account')
  connect(client: any) {
    this.homebridgeNestCamService.linkAccount(client);
  }
}
