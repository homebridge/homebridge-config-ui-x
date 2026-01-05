import type { EventEmitter } from 'node:events'

import { Inject, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common'
import { SubscribeMessage, WebSocketGateway, WsException } from '@nestjs/websockets'
import { red } from 'bash-color'

import { WsAdminGuard } from '../../core/auth/guards/ws-admin-guard.js'
import { devServerCorsConfig } from '../../core/cors.config.js'
import { Logger } from '../../core/logger/logger.service.js'
import { HomebridgeUpdateActionDto, PluginActionDto } from './plugins.dto.js'
import { PluginsService } from './plugins.service.js'

@UseGuards(WsAdminGuard)
@WebSocketGateway({
  namespace: '/plugins',
  allowEIO3: true,
  cors: devServerCorsConfig,
})
@UsePipes(new ValidationPipe({
  whitelist: true,
  exceptionFactory: (err) => {
    console.error(err)
    return new WsException(err)
  },
}))
export class PluginsGateway {
  constructor(
    @Inject(PluginsService) private readonly pluginsService: PluginsService,
    @Inject(Logger) private readonly logger: Logger,
  ) {}

  @SubscribeMessage('install')
  async installPlugin(client: EventEmitter, pluginAction: PluginActionDto) {
    try {
      return await this.pluginsService.managePlugin('install', pluginAction, client)
    } catch (e) {
      this.logger.error(e)
      client.emit('stdout', `\n\r${red(e.toString())}\n\r`)
      return new WsException(e)
    }
  }

  @SubscribeMessage('uninstall')
  async uninstallPlugin(client: EventEmitter, pluginAction: PluginActionDto) {
    try {
      return await this.pluginsService.managePlugin('uninstall', pluginAction, client)
    } catch (e) {
      this.logger.error(e)
      client.emit('stdout', `\n\r${red(e.toString())}\n\r`)
      return new WsException(e)
    }
  }

  @SubscribeMessage('update')
  async updatePlugin(client: EventEmitter, pluginAction: PluginActionDto) {
    try {
      return await this.pluginsService.managePlugin('install', pluginAction, client)
    } catch (e) {
      this.logger.error(e)
      client.emit('stdout', `\n\r${red(e.toString())}\n\r`)
      return new WsException(e)
    }
  }

  @SubscribeMessage('homebridge-update')
  async homebridgeUpdate(client: EventEmitter, homebridgeUpdateAction: HomebridgeUpdateActionDto) {
    try {
      return await this.pluginsService.updateHomebridgePackage(homebridgeUpdateAction, client)
    } catch (e) {
      this.logger.error(e)
      client.emit('stdout', `\n\r${red(e.toString())}\n\r`)
      return new WsException(e)
    }
  }
}
