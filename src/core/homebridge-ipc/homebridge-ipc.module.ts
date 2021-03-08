import { Module } from '@nestjs/common';
import { LoggerModule } from '../logger/logger.module';
import { HomebridgeIpcService } from './homebridge-ipc.service';

@Module({
  imports: [
    LoggerModule,
  ],
  providers: [
    HomebridgeIpcService
  ],
  exports: [
    HomebridgeIpcService
  ],
})
export class HomebridgeIpcModule { }
