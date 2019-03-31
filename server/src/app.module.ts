import { Module } from '@nestjs/common';
import { LoggerModule } from './core/logger/logger.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PluginsModule } from './modules/plugins/plugins.module';
import { UsersModule } from './modules/users/users.module';
import { StatusModule } from './modules/status/status.module';
import { LogModule } from './modules/log/log.module';
import { TerminalModule } from './modules/terminal/terminal.module';
import { AccessoriesModule } from './modules/accessories/accessories.module';
import { ConfigEditorModule } from './modules/config-editor/config-editor.module';
import { AuthModule } from './core/auth/auth.module';

@Module({
  imports: [
    LoggerModule,
    AuthModule,
    PluginsModule,
    UsersModule,
    StatusModule,
    TerminalModule,
    AccessoriesModule,
    ConfigEditorModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
