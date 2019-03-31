import { UseGuards } from '@nestjs/common';
import { SubscribeMessage, WebSocketGateway, WsException } from '@nestjs/websockets';
import { PluginsService } from '../plugins/plugins.service';
import { StatusService } from './status.service';
import { WsJwtGuard } from '../../core/auth/ws-jwt.guard';

@UseGuards(WsJwtGuard)
@WebSocketGateway({ namespace: 'status' })
export class StatusGateway {
  constructor(
    private statusService: StatusService,
    private pluginsService: PluginsService,
  ) { }

  @SubscribeMessage('monitor-server-status')
  async serverStatus(client, payload) {
    this.statusService.watchStats(client);
  }

  @SubscribeMessage('homebridge-version-check')
  async homebridgeVersionCheck(client, payload) {
    try {
      return await this.pluginsService.getHomebridgePackage();
    } catch (e) {
      return new WsException(e.message);
    }
  }
}
