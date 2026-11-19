import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'

import { ConfigModule } from '../../core/config/config.module.js'
import { FsModule } from '../../core/fs/fs.module.js'
import { LoggerModule } from '../../core/logger/logger.module.js'
import { AccessoriesModule } from '../accessories/accessories.module.js'
import { KioskDeviceGuard } from './kiosk-device.guard.js'
import { KioskController } from './kiosk.controller.js'
import { KioskGateway } from './kiosk.gateway.js'
import { KioskService } from './kiosk.service.js'

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ConfigModule,
    LoggerModule,
    FsModule,
    AccessoriesModule,
  ],
  providers: [
    KioskService,
    KioskGateway,
    KioskDeviceGuard,
  ],
  controllers: [
    KioskController,
  ],
  exports: [
    KioskService,
  ],
})
export class KioskModule {}
