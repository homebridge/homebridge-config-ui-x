import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'

import { ConfigModule } from '../../core/config/config.module'
import { HomebridgeIpcModule } from '../../core/homebridge-ipc/homebridge-ipc.module'
import { LoggerModule } from '../../core/logger/logger.module'
import { ChildBridgesModule } from '../child-bridges/child-bridges.module'
import { PluginsModule } from '../plugins/plugins.module'
import { ServerModule } from '../server/server.module'
import { StatusController } from './status.controller'
import { StatusGateway } from './status.gateway'
import { StatusService } from './status.service'

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    HttpModule,
    LoggerModule,
    PluginsModule,
    ConfigModule,
    ServerModule,
    HomebridgeIpcModule,
    ChildBridgesModule,
  ],
  providers: [
    StatusService,
    StatusGateway,
  ],
  controllers: [
    StatusController,
  ],
})
export class StatusModule {}
