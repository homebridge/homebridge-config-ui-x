import { Module } from '@nestjs/common'

import { AppController } from './app.controller.js'
import { AppGateway } from './app.gateway.js'
import { AppService } from './app.service.js'
import { AuthModule } from './core/auth/auth.module.js'
import { ConfigModule } from './core/config/config.module.js'
import { LoggerModule } from './core/logger/logger.module.js'
import { SchedulerModule } from './core/scheduler/scheduler.module.js'
import { AccessoriesModule } from './modules/accessories/accessories.module.js'
import { BackupModule } from './modules/backup/backup.module.js'
import { ChildBridgesModule } from './modules/child-bridges/child-bridges.module.js'
import { ConfigEditorModule } from './modules/config-editor/config-editor.module.js'
import { CustomPluginsModule } from './modules/custom-plugins/custom-plugins.module.js'
import { LogModule } from './modules/log/log.module.js'
import { PlatformToolsModule } from './modules/platform-tools/platform-tools.module.js'
import { PluginsModule } from './modules/plugins/plugins.module.js'
import { ServerModule } from './modules/server/server.module.js'
import { SetupWizardModule } from './modules/setup-wizard/setup-wizard.module.js'
import { StatusModule } from './modules/status/status.module.js'
import { UsersModule } from './modules/users/users.module.js'

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    SchedulerModule,
    AuthModule,
    PluginsModule,
    ServerModule,
    CustomPluginsModule,
    UsersModule,
    StatusModule,
    AccessoriesModule,
    ConfigEditorModule,
    PlatformToolsModule,
    ChildBridgesModule,
    BackupModule,
    LogModule,
    SetupWizardModule,
  ],
  controllers: [
    AppController,
  ],
  providers: [
    AppService,
    AppGateway,
  ],
})

export class AppModule {}
