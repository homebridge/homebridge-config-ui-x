import { Agent } from 'node:https'

import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'

import { ConfigModule } from '../../core/config/config.module'
import { LoggerModule } from '../../core/logger/logger.module'
import { NodePtyModule } from '../../core/node-pty/node-pty.module'
import { PluginsController } from './plugins.controller'
import { PluginsGateway } from './plugins.gateway'
import { PluginsService } from './plugins.service'

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    HttpModule.register({
      headers: {
        'User-Agent': 'homebridge-config-ui-x',
      },
      timeout: 10000,
      httpsAgent: new Agent({ keepAlive: true }),
    }),
    NodePtyModule,
    ConfigModule,
    LoggerModule,
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
