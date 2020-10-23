import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { ConfigModule } from '../../core/config/config.module';
import { LoggerModule } from '../../core/logger/logger.module';
import { SchedulerModule } from '../../core/scheduler/scheduler.module';
import { BackupService } from './backup.service';
import { BackupGateway } from './backup.gateway';
import { BackupController } from './backup.controller';
import { PluginsModule } from '../plugins/plugins.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ConfigModule,
    PluginsModule,
    SchedulerModule,
    LoggerModule,
  ],
  providers: [
    BackupService,
    BackupGateway,
  ],
  controllers: [
    BackupController,
  ],
})
export class BackupModule { }
