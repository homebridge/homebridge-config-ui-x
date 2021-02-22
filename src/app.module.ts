import { Module } from '@nestjs/common';
import { LoggerModule } from './core/logger/logger.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppGateway } from './app.gateway';
import { ConfigModule } from './core/config/config.module';
import { PluginsModule } from './modules/plugins/plugins.module';
import { CustomPluginsModule } from './modules/custom-plugins/custom-plugins.module';
import { UsersModule } from './modules/users/users.module';
import { StatusModule } from './modules/status/status.module';
import { LogModule } from './modules/log/log.module';
import { AccessoriesModule } from './modules/accessories/accessories.module';
import { ConfigEditorModule } from './modules/config-editor/config-editor.module';
import { AuthModule } from './core/auth/auth.module';
import { ServerModule } from './modules/server/server.module';
import { PlatformToolsModule } from './modules/platform-tools/platform-tools.module';
import { BackupModule } from './modules/backup/backup.module';

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
    BackupModule,
    LogModule,
  ],
  controllers: [
    AppController,
  ],
  providers: [
    AppService,
    AppGateway,
  ],
})
export class AppModule { }
