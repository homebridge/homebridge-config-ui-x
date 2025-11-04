import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'

import { ConfigModule } from '../../core/config/config.module.js'
import { HomebridgeIpcModule } from '../../core/homebridge-ipc/homebridge-ipc.module.js'
import { LoggerModule } from '../../core/logger/logger.module.js'
import { SchedulerModule } from '../../core/scheduler/scheduler.module.js'
import { AccessoriesModule } from '../accessories/accessories.module.js'
import { ChildBridgesModule } from '../child-bridges/child-bridges.module.js'
import { ConfigEditorModule } from '../config-editor/config-editor.module.js'
import { RestartSchedulerService } from './restart-scheduler.service.js'
import { ServerController } from './server.controller.js'
import { ServerService } from './server.service.js'

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ConfigModule,
    LoggerModule,
    SchedulerModule,
    ConfigEditorModule,
    AccessoriesModule,
    ChildBridgesModule,
    HomebridgeIpcModule,
  ],
  providers: [
    ServerService,
    RestartSchedulerService,
    { provide: 'UIX_RESTART_SCHEDULER', useExisting: RestartSchedulerService },
  ],
  controllers: [
    ServerController,
  ],
  exports: [
    ServerService,
  ],
})
export class ServerModule { }
