import { Module } from '@nestjs/common';

import { ConfigModule } from '../../../core/config/config.module';
import { LoggerModule } from '../../../core/logger/logger.module';
import { PluginsModule } from '../../plugins/plugins.module';
import { PluginsSettingsUiController } from './plugins-settings-ui.controller';
import { PluginSettingsUiGateway } from './plugins-settings-ui.gateway';
import { PluginsSettingsUiService } from './plugins-settings-ui.service';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    PluginsModule,
  ],
  providers: [
    PluginsSettingsUiService,
    PluginSettingsUiGateway,
  ],
  controllers: [
    PluginsSettingsUiController,
  ]
})
export class PluginsSettingsUiModule { }
