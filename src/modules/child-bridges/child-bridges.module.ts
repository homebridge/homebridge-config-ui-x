import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'

import { ConfigModule } from '../../core/config/config.module'
import { HomebridgeIpcModule } from '../../core/homebridge-ipc/homebridge-ipc.module'
import { LoggerModule } from '../../core/logger/logger.module'
import { AccessoriesModule } from '../accessories/accessories.module'
import { ChildBridgesGateway } from './child-bridges.gateway'
import { ChildBridgesService } from './child-bridges.service'

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
