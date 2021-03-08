import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { HomebridgeNestCamService } from './homebridge-nest-cam.service';
import { HomebridgeNestCamGateway } from './homebridge-nest-cam.gateway';
import { ConfigModule } from '../../../core/config/config.module';
import { LoggerModule } from '../../../core/logger/logger.module';
import { PluginsModule } from '../../plugins/plugins.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ConfigModule,
    LoggerModule,
    PluginsModule,
  ],
  providers: [
    HomebridgeNestCamService,
    HomebridgeNestCamGateway,
  ],
})
export class HomebridgeNestCamModule { }
