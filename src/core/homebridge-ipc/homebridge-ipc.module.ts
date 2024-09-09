import { Module } from '@nestjs/common'

import { ConfigModule } from '../config/config.module'
import { LoggerModule } from '../logger/logger.module'
import { HomebridgeIpcService } from './homebridge-ipc.service'

@Module({
  imports: [
    LoggerModule,
    ConfigModule,
  ],
  providers: [
    HomebridgeIpcService,
  ],
  exports: [
    HomebridgeIpcService,
  ],
})
export class HomebridgeIpcModule {}
