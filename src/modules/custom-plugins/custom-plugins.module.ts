import { Module } from '@nestjs/common';
import { HomebridgeHueModule } from './homebridge-hue/homebridge-hue.module';
import { PluginsSettingsUiModule } from './plugins-settings-ui/plugins-settings-ui.module';

@Module({
  imports: [
    HomebridgeHueModule,
    PluginsSettingsUiModule,
  ],
  controllers: [],
  providers: [],
})
export class CustomPluginsModule { }
