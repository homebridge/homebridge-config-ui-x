import { Module, HttpModule } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { StatusService } from './status.service';
import { StatusGateway } from './status.gateway';
import { PluginsModule } from '../plugins/plugins.module';
import { ConfigModule } from '../../core/config/config.module';
import { LoggerModule } from '../../core/logger/logger.module';
import { StatusController } from './status.controller';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    HttpModule,
    LoggerModule,
    PluginsModule,
    ConfigModule,
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
