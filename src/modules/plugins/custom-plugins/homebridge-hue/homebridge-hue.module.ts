import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { LoggerModule } from '../../../../core/logger/logger.module';
import { ConfigModule } from '../../../../core/config/config.module';
import { HomebridgeHueController } from './homebridge-hue.controller';
import { HomebridgeHueService } from './homebridge-hue.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ConfigModule,
    LoggerModule,
  ],
  providers: [
    HomebridgeHueService,
  ],
  exports: [
  ],
  controllers: [
    HomebridgeHueController,
  ],
})
export class HomebridgeHueModule { }
