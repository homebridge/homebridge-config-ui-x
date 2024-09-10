import { UseGuards } from '@nestjs/common'
import { SubscribeMessage, WebSocketGateway, WsException } from '@nestjs/websockets'

import { WsGuard } from '../../core/auth/guards/ws.guard'
import { ChildBridgesService } from './child-bridges.service'

@UseGuards(WsGuard)
@WebSocketGateway({
  namespace: '/child-bridges',
  allowEIO3: true,
  cors: {
    origin: ['http://localhost:8080', 'http://localhost:4200'],
    credentials: true,
  },
})
export class ChildBridgesGateway {
  constructor(
    private childBridgesService: ChildBridgesService,
  ) {}

  @SubscribeMessage('get-homebridge-child-bridge-status')
  async getChildBridges() {
    try {
      return await this.childBridgesService.getChildBridges()
    } catch (e) {
      return new WsException(e.message)
    }
  }

  @SubscribeMessage('monitor-child-bridge-status')
  async watchChildBridgeStatus(client) {
    this.childBridgesService.watchChildBridgeStatus(client)
  }

  @SubscribeMessage('restart-child-bridge')
  async restartChildBridge(client, payload) {
    try {
      return this.childBridgesService.restartChildBridge(payload)
    } catch (e) {
      return new WsException(e.message)
    }
  }

  @SubscribeMessage('stop-child-bridge')
  async stopChildBridge(client, payload) {
    try {
      return this.childBridgesService.stopChildBridge(payload)
    } catch (e) {
      return new WsException(e.message)
    }
  }

  @SubscribeMessage('start-child-bridge')
  async startChildBridge(client, payload) {
    try {
      return this.childBridgesService.startChildBridge(payload)
    } catch (e) {
      return new WsException(e.message)
    }
  }
}
