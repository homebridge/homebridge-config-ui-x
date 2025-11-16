import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'

import { ConfigModule } from '../../core/config/config.module.js'
import { HomebridgeIpcModule } from '../../core/homebridge-ipc/homebridge-ipc.module.js'
import { LoggerModule } from '../../core/logger/logger.module.js'
import { AccessoriesController } from './accessories.controller.js'
import { AccessoriesGateway } from './accessories.gateway.js'
import { AccessoriesService } from './accessories.service.js'

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ConfigModule,
    LoggerModule,
    HomebridgeIpcModule,
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
