import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'

import { ConfigModule } from '../../../core/config/config.module'
import { LoggerModule } from '../../../core/logger/logger.module'
import { HbServiceController } from './hb-service.controller'
import { HbServiceService } from './hb-service.service'

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
