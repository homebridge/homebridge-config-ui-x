import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'

import { ConfigModule } from '../../core/config/config.module'
import { HomebridgeIpcModule } from '../../core/homebridge-ipc/homebridge-ipc.module'
import { LoggerModule } from '../../core/logger/logger.module'
import { SchedulerModule } from '../../core/scheduler/scheduler.module'
import { PluginsModule } from '../plugins/plugins.module'
import { ConfigEditorController } from './config-editor.controller'
import { ConfigEditorService } from './config-editor.service'

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    LoggerModule,
    ConfigModule,
    SchedulerModule,
    PluginsModule,
    HomebridgeIpcModule,
  ],
  providers: [
    ConfigEditorService,
  ],
  controllers: [
    ConfigEditorController,
  ],
  exports: [
    ConfigEditorService,
  ],
})
export class ConfigEditorModule {}
