import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'

import { ConfigModule } from '../../core/config/config.module'
import { HomebridgeIpcModule } from '../../core/homebridge-ipc/homebridge-ipc.module'
import { LoggerModule } from '../../core/logger/logger.module'
import { SchedulerModule } from '../../core/scheduler/scheduler.module'
import { PluginsModule } from '../plugins/plugins.module'
import { BackupController } from './backup.controller'
import { BackupGateway } from './backup.gateway'
import { BackupService } from './backup.service'

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
