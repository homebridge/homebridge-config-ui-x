import { Module } from '@nestjs/common'

import { PluginsSettingsUiTicketService } from './plugins-settings-ui-ticket.service.js'

@Module({
  providers: [PluginsSettingsUiTicketService],
  exports: [PluginsSettingsUiTicketService],
})
export class PluginsSettingsUiTicketModule {}
