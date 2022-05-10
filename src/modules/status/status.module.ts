import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PassportModule } from '@nestjs/passport';

import { StatusService } from './status.service';
import { StatusGateway } from './status.gateway';
import { PluginsModule } from '../plugins/plugins.module';
import { ConfigModule } from '../../core/config/config.module';
import { LoggerModule } from '../../core/logger/logger.module';
import { HomebridgeIpcModule } from '../../core/homebridge-ipc/homebridge-ipc.module';
import { StatusController } from './status.controller';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    HttpModule,
    LoggerModule,
    PluginsModule,
    ConfigModule,
    HomebridgeIpcModule,
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
