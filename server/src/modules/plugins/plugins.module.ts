import { Module } from '@nestjs/common';
import { PluginsService } from './plugins.service';
import { LoggerModule } from '../../core/logger/logger.module';
import { PluginsController } from './plugins.controller';
import { PluginsGateway } from './plugins.gateway';
import { ConfigModule } from '../../core/config/config.module';

@Module({
  imports: [
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
export class PluginsModule { }
