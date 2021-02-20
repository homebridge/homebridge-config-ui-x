import { EventEmitter } from 'events';
import { UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { SubscribeMessage, WebSocketGateway, WsException } from '@nestjs/websockets';
import * as color from 'bash-color';

import { PluginsService } from './plugins.service';
import { PluginActionDto, HomebridgeUpdateActionDto } from './plugins.dto';
import { Logger } from '../../core/logger/logger.service';
import { WsAdminGuard } from '../../core/auth/guards/ws-admin-guard';

@UseGuards(WsAdminGuard)
@WebSocketGateway({ namespace: '/plugins' })
@UsePipes(new ValidationPipe({
  whitelist: true,
  exceptionFactory: ((err) => {
    console.error(err);
    return new WsException(err);
  }),
}))
export class PluginsGateway {

  constructor(
    private pluginsService: PluginsService,
    private logger: Logger,
  ) { }

  @SubscribeMessage('install')
  async installPlugin(client: EventEmitter, payload: PluginActionDto) {
    try {
      return await this.pluginsService.installPlugin(payload.name, payload.version || 'latest', client);
    } catch (e) {
      this.logger.error(e);
      client.emit('stdout', '\n\r' + color.red(e.toString()) + '\n\r');
      return new WsException(e);
    }
  }

  @SubscribeMessage('uninstall')
  async uninstallPlugin(client: EventEmitter, payload: PluginActionDto) {
    try {
      return await this.pluginsService.uninstallPlugin(payload.name, client);
    } catch (e) {
      this.logger.error(e);
      client.emit('stdout', '\n\r' + color.red(e.toString()) + '\n\r');
      return new WsException(e);
    }
  }

  @SubscribeMessage('update')
  async updatePlugin(client: EventEmitter, payload: PluginActionDto) {
    try {
      return await this.pluginsService.updatePlugin(payload.name, payload.version || 'latest', client);
    } catch (e) {
      this.logger.error(e);
      client.emit('stdout', '\n\r' + color.red(e.toString()) + '\n\r');
      return new WsException(e);
    }
  }

  @SubscribeMessage('homebridge-update')
  async homebridgeUpdate(client: EventEmitter, payload: HomebridgeUpdateActionDto) {
    try {
      return await this.pluginsService.updateHomebridgePackage(payload.version || 'latest', client);
    } catch (e) {
      this.logger.error(e);
      client.emit('stdout', '\n\r' + color.red(e.toString()) + '\n\r');
      return new WsException(e);
    }
  }
}
