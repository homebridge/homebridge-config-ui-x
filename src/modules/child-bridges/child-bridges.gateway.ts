import { UseGuards } from '@nestjs/common';
import { SubscribeMessage, WebSocketGateway, WsException } from '@nestjs/websockets';

import { WsAdminGuard } from '../../core/auth/guards/ws-admin-guard';
import { ChildBridgesService } from './child-bridges.service';

@UseGuards(WsAdminGuard)
@WebSocketGateway({
  namespace: '/child-bridges', allowEIO3: true, cors: {
    origin: ['http://localhost:8080', 'http://localhost:4200'],
    credentials: true
  }
})
export class ChildBridgesGateway {
  constructor(
    private childBridgesService: ChildBridgesService,
  ) { }

  @SubscribeMessage('get-homebridge-child-bridge-status')
  async getChildBridges(client, payload) {
    try {
      return await this.childBridgesService.getChildBridges();
    } catch (e) {
      return new WsException(e.message);
    }
  }

  @SubscribeMessage('monitor-child-bridge-status')
  async watchChildBridgeStatus(client, payload) {
    this.childBridgesService.watchChildBridgeStatus(client);
  }

  @SubscribeMessage('restart-child-bridge')
  async restartChildBridge(client, payload) {
    console.log('restart-child-bridge', payload);

    try {
      return await this.childBridgesService.restartChildBridge(payload);
    } catch (e) {
      return new WsException(e.message);
    }
  }

  @SubscribeMessage('stop-child-bridge')
  async stopChildBridge(client, payload) {
    try {
      return await this.childBridgesService.stopChildBridge(payload);
    } catch (e) {
      return new WsException(e.message);
    }
  }

  @SubscribeMessage('start-child-bridge')
  async startChildBridge(client, payload) {
    try {
      return await this.childBridgesService.startChildBridge(payload);
    } catch (e) {
      return new WsException(e.message);
    }
  }
}
