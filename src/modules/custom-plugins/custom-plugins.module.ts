import { Module } from '@nestjs/common'

import { HomebridgeDeconzModule } from './homebridge-deconz/homebridge-deconz.module'
import { HomebridgeHueModule } from './homebridge-hue/homebridge-hue.module'
import { PluginsSettingsUiModule } from './plugins-settings-ui/plugins-settings-ui.module'

@Module({
  imports: [
    HomebridgeDeconzModule,
    HomebridgeHueModule,
    PluginsSettingsUiModule,
  ],
  controllers: [],
  providers: [],
})
export class CustomPluginsModule {}
