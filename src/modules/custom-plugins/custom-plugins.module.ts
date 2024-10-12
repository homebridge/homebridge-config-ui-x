import { Module } from '@nestjs/common'

import { HomebridgeDeconzModule } from './homebridge-deconz/homebridge-deconz.module.js'
import { HomebridgeHueModule } from './homebridge-hue/homebridge-hue.module.js'
import { PluginsSettingsUiModule } from './plugins-settings-ui/plugins-settings-ui.module.js'

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
