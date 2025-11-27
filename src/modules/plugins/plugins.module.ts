import { Agent } from 'node:https'

import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'

import { ConfigModule } from '../../core/config/config.module.js'
import { HomebridgeIpcModule } from '../../core/homebridge-ipc/homebridge-ipc.module.js'
import { LoggerModule } from '../../core/logger/logger.module.js'
import { NodePtyModule } from '../../core/node-pty/node-pty.module.js'
import { ChildBridgesModule } from '../child-bridges/child-bridges.module.js'
import { NPM_FETCH_TIMEOUT } from './plugins.constants.js'
import { PluginsController } from './plugins.controller.js'
import { PluginsGateway } from './plugins.gateway.js'
import { PluginsService } from './plugins.service.js'

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    HttpModule.register({
      headers: {
        'User-Agent': 'homebridge-config-ui-x',
      },
      timeout: NPM_FETCH_TIMEOUT,
      httpsAgent: new Agent({ keepAlive: true }),
    }),
    NodePtyModule,
    ConfigModule,
    LoggerModule,
    HomebridgeIpcModule,
    ChildBridgesModule,
  ],
  providers: [
    PluginsService,
    PluginsGateway,
  ],
  exports: [
    PluginsService,
  ],
  controllers: [
    PluginsController,
  ],
})
export class PluginsModule {}
