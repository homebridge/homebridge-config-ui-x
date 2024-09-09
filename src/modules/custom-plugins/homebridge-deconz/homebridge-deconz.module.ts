import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'

import { ConfigModule } from '../../../core/config/config.module'
import { LoggerModule } from '../../../core/logger/logger.module'
import { HomebridgeDeconzController } from './homebridge-deconz.controller'
import { HomebridgeDeconzService } from './homebridge-deconz.service'

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
