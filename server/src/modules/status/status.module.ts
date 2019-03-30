import { Module } from '@nestjs/common';
import { StatusService } from './status.service';
import { StatusGateway } from './status.gateway';
import { PluginsModule } from '../plugins/plugins.module';
import { ConfigModule } from '../../core/config/config.module';
import { LoggerModule } from '../../core/logger/logger.module';

@Module({
  imports: [
    LoggerModule,
    PluginsModule,
    ConfigModule,
  ],
  providers: [
    StatusService,
    StatusGateway,
  ],
})
export class StatusModule { }
