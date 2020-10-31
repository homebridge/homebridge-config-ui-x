import { SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { EventEmitter } from 'events';

import { WsAdminGuard } from '../../../core/auth/guards/ws-admin-guard';
import { PluginsSettingsUiService } from './plugins-settings-ui.service';

@UseGuards(WsAdminGuard)
@WebSocketGateway({ namespace: 'plugins/settings-ui' })
export class PluginsSettingsUiGateway {

  constructor(
    private pluginSettingsUiService: PluginsSettingsUiService,
  ) { }

  @SubscribeMessage('start')
  startCustomUiHandler(client: EventEmitter, payload: string) {
    return this.pluginSettingsUiService.startCustomUiHandler(payload, client);
  }
}
