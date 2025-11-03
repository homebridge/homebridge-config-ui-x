import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'

import { ConfigModule } from '../../core/config/config.module.js'
import { HomebridgeIpcModule } from '../../core/homebridge-ipc/homebridge-ipc.module.js'
import { LoggerModule } from '../../core/logger/logger.module.js'
import { AccessoriesModule } from '../accessories/accessories.module.js'
import { ChildBridgesGateway } from './child-bridges.gateway.js'
import { ChildBridgesService } from './child-bridges.service.js'

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    LoggerModule,
    ConfigModule,
    AccessoriesModule,
    HomebridgeIpcModule,
  ],
  providers: [
    ChildBridgesService,
    ChildBridgesGateway,
  ],
  exports: [
    ChildBridgesService,
  ],
})
export class ChildBridgesModule {}
