import { SubscribeMessage, WebSocketGateway, OnGatewayConnection, OnGatewayDisconnect, WsException } from '@nestjs/websockets';
import { PluginsService } from '../plugins/plugins.service';
import { StatusService } from './status.service';

@WebSocketGateway({ namespace: 'status' })
export class StatusGateway implements OnGatewayConnection {
  constructor(
    private statusService: StatusService,
    private pluginsService: PluginsService,
  ) { }

  handleConnection(client) {
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
