import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'

import { ConfigModule } from '../../core/config/config.module.js'
import { HomebridgeIpcModule } from '../../core/homebridge-ipc/homebridge-ipc.module.js'
import { LoggerModule } from '../../core/logger/logger.module.js'
import { SchedulerModule } from '../../core/scheduler/scheduler.module.js'
import { PluginsModule } from '../plugins/plugins.module.js'
import { BackupController } from './backup.controller.js'
import { BackupGateway } from './backup.gateway.js'
import { BackupService } from './backup.service.js'

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ConfigModule,
    PluginsModule,
    SchedulerModule,
    LoggerModule,
    HomebridgeIpcModule,
  ],
  providers: [
    BackupService,
    BackupGateway,
  ],
  controllers: [
    BackupController,
  ],
})
export class BackupModule {}
