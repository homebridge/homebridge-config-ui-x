import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'

import { ConfigModule } from '../../../core/config/config.module.js'
import { LoggerModule } from '../../../core/logger/logger.module.js'
import { HbServiceController } from './hb-service.controller.js'
import { HbServiceService } from './hb-service.service.js'

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ConfigModule,
    LoggerModule,
  ],
  providers: [
    HbServiceService,
  ],
  controllers: [
    HbServiceController,
  ],
})
export class HbServiceModule {}
