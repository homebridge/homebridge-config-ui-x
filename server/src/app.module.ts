import { Module } from '@nestjs/common';
import { LoggerModule } from './core/logger/logger.module';
import { AppController } from './app.controller';
import { AppGateway } from './app.gateway';
import { AppService } from './app.service';
import { PluginsModule } from './modules/plugins/plugins.module';
import { UsersModule } from './modules/users/users.module';
import { StatusModule } from './modules/status/status.module';
import { LogModule } from './modules/log/log.module';
import { TerminalModule } from './modules/terminal/terminal.module';
import { AccessoriesModule } from './modules/accessories/accessories.module';
import { ConfigEditorModule } from './modules/config-editor/config-editor.module';

@Module({
  imports: [
    LoggerModule,
    PluginsModule,
    UsersModule,
    StatusModule,
    TerminalModule,
    AccessoriesModule,
    ConfigEditorModule,
  ],
  controllers: [AppController],
  providers: [AppService, AppGateway],
})
export class AppModule { }
