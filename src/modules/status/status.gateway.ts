import { ModuleRef } from '@nestjs/core';
import { UseGuards } from '@nestjs/common';
import { SubscribeMessage, WebSocketGateway, WsException } from '@nestjs/websockets';
import { PluginsService } from '../plugins/plugins.service';
import { StatusService } from './status.service';
import { WsGuard } from '../../core/auth/guards/ws.guard';

@UseGuards(WsGuard)
@WebSocketGateway({ namespace: 'status' })
export class StatusGateway {

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

  @SubscribeMessage('npm-version-check')
  async npmVersionCheck(client, payload) {
    try {
      return await this.pluginsService.getNpmPackage();
    } catch (e) {
      return new WsException(e.message);
    }
  }

  @SubscribeMessage('get-out-of-date-plugins')
  async getOutOfDatePlugins(client, payload) {
    try {
      return await this.pluginsService.getOutOfDatePlugins();
    } catch (e) {
      return new WsException(e.message);
    }
  }

  @SubscribeMessage('get-dashboard-layout')
  async getDashboardLayout(client, payload) {
    try {
      return await this.statusService.getDashboardLayout();
    } catch (e) {
      return new WsException(e.message);
    }
  }

  @SubscribeMessage('set-dashboard-layout')
  async setDashboardLayout(client, payload) {
    try {
      return await this.statusService.setDashboardLayout(payload);
    } catch (e) {
      return new WsException(e.message);
    }
  }

  @SubscribeMessage('get-homebridge-server-info')
  async getHomebridgeServerInfo(client, payload) {
    try {
      return await this.statusService.getHomebridgeServerInfo();
    } catch (e) {
      return new WsException(e.message);
    }
  }
}
