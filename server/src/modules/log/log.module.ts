import { Module } from '@nestjs/common';
import { LogService } from './log.service';
import { LogGateway } from './log.gateway';
import { ConfigModule } from 'src/core/config/config.module';
import { LoggerModule } from 'src/core/logger/logger.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
  ],
  providers: [
    LogService,
    LogGateway,
  ],
})
export class LogModule { }
