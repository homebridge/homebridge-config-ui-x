import { Module } from '@nestjs/common'

import { AppController } from './app.controller'
import { AppGateway } from './app.gateway'
import { AppService } from './app.service'
import { AuthModule } from './core/auth/auth.module'
import { ConfigModule } from './core/config/config.module'
import { LoggerModule } from './core/logger/logger.module'
import { AccessoriesModule } from './modules/accessories/accessories.module'
import { BackupModule } from './modules/backup/backup.module'
import { ChildBridgesModule } from './modules/child-bridges/child-bridges.module'
import { ConfigEditorModule } from './modules/config-editor/config-editor.module'
import { CustomPluginsModule } from './modules/custom-plugins/custom-plugins.module'
import { LogModule } from './modules/log/log.module'
import { PlatformToolsModule } from './modules/platform-tools/platform-tools.module'
import { PluginsModule } from './modules/plugins/plugins.module'
import { ServerModule } from './modules/server/server.module'
import { SetupWizardModule } from './modules/setup-wizard/setup-wizard.module'
import { StatusModule } from './modules/status/status.module'
import { UsersModule } from './modules/users/users.module'

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    AuthModule,
    ServerModule,
    PluginsModule,
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
