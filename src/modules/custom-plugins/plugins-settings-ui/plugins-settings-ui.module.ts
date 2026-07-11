import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'

import { AuthModule } from '../../../core/auth/auth.module.js'
import { ConfigModule } from '../../../core/config/config.module.js'
import { LoggerModule } from '../../../core/logger/logger.module.js'
import { PluginsModule } from '../../plugins/plugins.module.js'
import { PluginsSettingsUiController } from './plugins-settings-ui.controller.js'
import { PluginsSettingsUiGateway } from './plugins-settings-ui.gateway.js'
import { PluginsSettingsUiService } from './plugins-settings-ui.service.js'

@Module({
  imports: [
    AuthModule,
    ConfigModule,
    LoggerModule,
    PluginsModule,
    HttpModule,
  ],
  providers: [
    PluginsSettingsUiService,
    PluginsSettingsUiGateway,
  ],
  controllers: [
    PluginsSettingsUiController,
  ],
})
export class PluginsSettingsUiModule {}
