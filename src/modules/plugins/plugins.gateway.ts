import { UseGuards } from '@nestjs/common';
import { SubscribeMessage, WebSocketGateway, WsException } from '@nestjs/websockets';
import * as color from 'bash-color';
import { PluginsService } from './plugins.service';
import { Logger } from '../../core/logger/logger.service';
import { WsAdminGuard } from '../../core/auth/guards/ws-admin-guard';

@UseGuards(WsAdminGuard)
@WebSocketGateway({ namespace: '/plugins' })
export class PluginsGateway {

  constructor(
    private pluginsService: PluginsService,
    private logger: Logger,
  ) { }

  @SubscribeMessage('install')
  async installPlugin(client, payload) {
    try {
      return await this.pluginsService.installPlugin(payload, client);
    } catch (e) {
      this.logger.error(e);
      client.emit('stdout', '\n\r' + color.red(e.toString()) + '\n\r');
      return new WsException(e);
    }
  }

  @SubscribeMessage('uninstall')
  async uninstallPlugin(client, payload) {
    try {
      return await this.pluginsService.uninstallPlugin(payload, client);
    } catch (e) {
      this.logger.error(e);
      client.emit('stdout', '\n\r' + color.red(e.toString()) + '\n\r');
      return new WsException(e);
    }
  }

  @SubscribeMessage('update')
  async updatePlugin(client, payload) {
    try {
      return await this.pluginsService.updatePlugin(payload, client);
    } catch (e) {
      this.logger.error(e);
      client.emit('stdout', '\n\r' + color.red(e.toString()) + '\n\r');
      return new WsException(e);
    }
  }

  @SubscribeMessage('homebridge-update')
  async homebridgeUpdate(client, payload) {
    try {
      return await this.pluginsService.updateHomebridgePackage(client);
    } catch (e) {
      this.logger.error(e);
      client.emit('stdout', '\n\r' + color.red(e.toString()) + '\n\r');
      return new WsException(e);
    }
  }
}
