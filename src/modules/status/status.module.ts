import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PassportModule } from '@nestjs/passport';

import { PluginsModule } from '../plugins/plugins.module';
import { ConfigModule } from '../../core/config/config.module';
import { LoggerModule } from '../../core/logger/logger.module';
import { HomebridgeIpcModule } from '../../core/homebridge-ipc/homebridge-ipc.module';
import { ChildBridgesModule } from '../child-bridges/child-bridges.module';
import { ServerModule } from '../server/server.module';
import { StatusService } from './status.service';
import { StatusGateway } from './status.gateway';
import { StatusController } from './status.controller';

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
export class StatusModule { }
