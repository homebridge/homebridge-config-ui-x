import { Module } from '@nestjs/common';
import { LoggerModule } from './core/logger/logger.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './core/config/config.module';
import { PluginsModule } from './modules/plugins/plugins.module';
import { UsersModule } from './modules/users/users.module';
import { StatusModule } from './modules/status/status.module';
import { LogModule } from './modules/log/log.module';
import { TerminalModule } from './modules/terminal/terminal.module';
import { AccessoriesModule } from './modules/accessories/accessories.module';
import { ConfigEditorModule } from './modules/config-editor/config-editor.module';
import { AuthModule } from './core/auth/auth.module';
import { ServerModule } from './modules/server/server.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    AuthModule,
    ServerModule,
    PluginsModule,
    UsersModule,
    StatusModule,
    TerminalModule,
    AccessoriesModule,
    ConfigEditorModule,
    LogModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
