import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'

import { ConfigModule } from '../../core/config/config.module.js'
import { HomebridgeIpcModule } from '../../core/homebridge-ipc/homebridge-ipc.module.js'
import { LoggerModule } from '../../core/logger/logger.module.js'
import { SchedulerModule } from '../../core/scheduler/scheduler.module.js'
import { PluginsModule } from '../plugins/plugins.module.js'
import { ConfigEditorController } from './config-editor.controller.js'
import { ConfigEditorService } from './config-editor.service.js'

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
