import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'

import { ConfigModule } from '../../core/config/config.module'
import { LoggerModule } from '../../core/logger/logger.module'
import { AccessoriesController } from './accessories.controller'
import { AccessoriesGateway } from './accessories.gateway'
import { AccessoriesService } from './accessories.service'

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ConfigModule,
    LoggerModule,
  ],
  providers: [
    AccessoriesService,
    AccessoriesGateway,
  ],
  exports: [
    AccessoriesService,
  ],
  controllers: [
    AccessoriesController,
  ],
})
export class AccessoriesModule {}
