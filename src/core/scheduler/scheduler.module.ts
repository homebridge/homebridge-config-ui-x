import { Module } from '@nestjs/common'

import { ConfigModule } from '../config/config.module.js'
import { HomebridgeIpcModule } from '../homebridge-ipc/homebridge-ipc.module.js'
import { LoggerModule } from '../logger/logger.module.js'
import { SchedulerService } from './scheduler.service.js'

@Module({
  imports: [
    ConfigModule,
    HomebridgeIpcModule,
    LoggerModule,
  ],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
