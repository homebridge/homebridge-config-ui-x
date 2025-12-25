import type { EventEmitter } from 'node:events'

import { Inject, UseGuards } from '@nestjs/common'
import { SubscribeMessage, WebSocketGateway } from '@nestjs/websockets'

import { WsAdminGuard } from '../../../core/auth/guards/ws-admin-guard.js'
import { PluginsSettingsUiService } from './plugins-settings-ui.service.js'

@UseGuards(WsAdminGuard)
@WebSocketGateway({
  namespace: 'plugins/settings-ui',
  allowEIO3: true,
  cors: {
    origin: ['http://localhost:8080', 'http://localhost:4200'],
    credentials: true,
  },
})
export class PluginsSettingsUiGateway {
  constructor(
    @Inject(PluginsSettingsUiService) private readonly pluginSettingsUiService: PluginsSettingsUiService,
  ) {}

  @SubscribeMessage('start')
  startCustomUiHandler(client: EventEmitter, payload: string) {
    return this.pluginSettingsUiService.startCustomUiHandler(payload, client)
  }
}
