import { ModuleRef } from '@nestjs/core';
import { UseGuards } from '@nestjs/common';
import { SubscribeMessage, WebSocketGateway, WsException } from '@nestjs/websockets';
import { PluginsService } from '../plugins/plugins.service';
import { StatusService } from './status.service';
import { WsJwtGuard } from '../../core/auth/ws-jwt.guard';
import { AuthService } from '../../core/auth/auth.service';


@UseGuards(WsJwtGuard)
@WebSocketGateway({ namespace: 'status' })
export class StatusGateway {
  private authService: AuthService;

  constructor(
    private statusService: StatusService,
    private pluginsService: PluginsService,
    private readonly moduleRef: ModuleRef,
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
