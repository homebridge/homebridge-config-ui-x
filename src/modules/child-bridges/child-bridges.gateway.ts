import { Inject, UseGuards } from '@nestjs/common'
import { SubscribeMessage, WebSocketGateway, WsException } from '@nestjs/websockets'

import { WsAdminGuard } from '../../core/auth/guards/ws-admin-guard.js'
import { WsGuard } from '../../core/auth/guards/ws.guard.js'
import { devServerCorsConfig } from '../../core/cors.config.js'
import { ChildBridgesService } from './child-bridges.service.js'

// Class-level guard requires any authenticated user, so the read-only status
// handlers below stay available to the non-admin dashboard. The three handlers
// that start/stop/restart a bridge are separately gated to admins with
// @UseGuards(WsAdminGuard) — matching the REST equivalents in
// server.controller.ts, which are all AdminGuard. Without this a non-admin
// could stop every child bridge over the socket.
@UseGuards(WsGuard)
@WebSocketGateway({
  namespace: '/child-bridges',
  allowEIO3: true,
  cors: devServerCorsConfig,
})
export class ChildBridgesGateway {
  constructor(
    @Inject(ChildBridgesService) private readonly childBridgesService: ChildBridgesService,
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

  @UseGuards(WsAdminGuard)
  @SubscribeMessage('restart-child-bridge')
  async restartChildBridge(client, payload) {
    try {
      return this.childBridgesService.restartChildBridge(payload)
    } catch (e) {
      return new WsException(e.message)
    }
  }

  @UseGuards(WsAdminGuard)
  @SubscribeMessage('stop-child-bridge')
  async stopChildBridge(client, payload) {
    try {
      return this.childBridgesService.stopChildBridge(payload)
    } catch (e) {
      return new WsException(e.message)
    }
  }

  @UseGuards(WsAdminGuard)
  @SubscribeMessage('start-child-bridge')
  async startChildBridge(client, payload) {
    try {
      return this.childBridgesService.startChildBridge(payload)
    } catch (e) {
      return new WsException(e.message)
    }
  }
}
