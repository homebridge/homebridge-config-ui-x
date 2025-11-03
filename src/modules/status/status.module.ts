import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'

import { ConfigModule } from '../../core/config/config.module.js'
import { HomebridgeIpcModule } from '../../core/homebridge-ipc/homebridge-ipc.module.js'
import { LoggerModule } from '../../core/logger/logger.module.js'
import { ChildBridgesModule } from '../child-bridges/child-bridges.module.js'
import { PluginsModule } from '../plugins/plugins.module.js'
import { ServerModule } from '../server/server.module.js'
import { StatusController } from './status.controller.js'
import { StatusGateway } from './status.gateway.js'
import { StatusService } from './status.service.js'

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
