import { Module, HttpModule } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { LoggerModule } from '../../../core/logger/logger.module';
import { ConfigModule } from '../../../core/config/config.module';
import { HomebridgeRingService } from './homebridge-ring.service';
import { HomebridgeRingController } from './homebridge-ring.controller';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ConfigModule,
    LoggerModule,
    HttpModule,
  ],
  providers: [
    HomebridgeRingService,
  ],
  exports: [
  ],
  controllers: [
    HomebridgeRingController,
  ],
})
export class HomebridgeRingModule { }
