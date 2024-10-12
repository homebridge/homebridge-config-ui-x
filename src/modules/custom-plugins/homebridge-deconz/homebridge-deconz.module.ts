import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'

import { ConfigModule } from '../../../core/config/config.module.js'
import { LoggerModule } from '../../../core/logger/logger.module.js'
import { HomebridgeDeconzController } from './homebridge-deconz.controller.js'
import { HomebridgeDeconzService } from './homebridge-deconz.service.js'

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ConfigModule,
    LoggerModule,
  ],
  providers: [
    HomebridgeDeconzService,
  ],
  exports: [
  ],
  controllers: [
    HomebridgeDeconzController,
  ],
})
export class HomebridgeDeconzModule {}
