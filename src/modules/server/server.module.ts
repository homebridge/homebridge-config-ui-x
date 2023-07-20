import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { ConfigModule } from '../../core/config/config.module';
import { LoggerModule } from '../../core/logger/logger.module';
import { HomebridgeIpcModule } from '../../core/homebridge-ipc/homebridge-ipc.module';
import { ConfigEditorModule } from '../config-editor/config-editor.module';
import { ChildBridgesModule } from '../child-bridges/child-bridges.module';
import { AccessoriesModule } from '../accessories/accessories.module';
import { ServerService } from './server.service';
import { ServerController } from './server.controller';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ConfigModule,
    LoggerModule,
    ConfigEditorModule,
    AccessoriesModule,
    ChildBridgesModule,
    HomebridgeIpcModule,
  ],
  providers: [
    ServerService,
  ],
  controllers: [
    ServerController,
  ],
  exports: [
    ServerService,
  ]
})
export class ServerModule { }
