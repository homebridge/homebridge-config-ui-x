import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'

import { ConfigModule } from '../../../core/config/config.module.js'
import { LoggerModule } from '../../../core/logger/logger.module.js'
import { HomebridgeHueController } from './homebridge-hue.controller.js'
import { HomebridgeHueService } from './homebridge-hue.service.js'

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ConfigModule,
    LoggerModule,
  ],
  providers: [
    HomebridgeHueService,
  ],
  exports: [
  ],
  controllers: [
    HomebridgeHueController,
  ],
})
export class HomebridgeHueModule {}
