import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'

import { ConfigModule } from '../../core/config/config.module'
import { HomebridgeIpcModule } from '../../core/homebridge-ipc/homebridge-ipc.module'
import { LoggerModule } from '../../core/logger/logger.module'
import { AccessoriesModule } from '../accessories/accessories.module'
import { ChildBridgesModule } from '../child-bridges/child-bridges.module'
import { ConfigEditorModule } from '../config-editor/config-editor.module'
import { ServerController } from './server.controller'
import { ServerService } from './server.service'

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
  ],
})
export class ServerModule {}
