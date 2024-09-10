import { UseGuards } from '@nestjs/common'

import { SubscribeMessage, WebSocketGateway } from '@nestjs/websockets'
import type { EventEmitter } from 'node:events'

import { WsAdminGuard } from '../../../core/auth/guards/ws-admin-guard'
import { PluginsSettingsUiService } from './plugins-settings-ui.service'

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
    private pluginSettingsUiService: PluginsSettingsUiService,
  ) {}

  @SubscribeMessage('start')
  startCustomUiHandler(client: EventEmitter, payload: string) {
    return this.pluginSettingsUiService.startCustomUiHandler(payload, client)
  }
}
