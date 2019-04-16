import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '../../core/config/config.module';
import { ServerService } from './server.service';
import { ServerController } from './server.controller';
import { LoggerModule } from '../../core/logger/logger.module';
import { ConfigEditorModule } from '../config-editor/config-editor.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ConfigModule,
    LoggerModule,
    ConfigEditorModule,
  ],
  providers: [
    ServerService,
  ],
  controllers: [
    ServerController,
  ],
})
export class ServerModule { }
