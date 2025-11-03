import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'

import { ConfigModule } from '../../../core/config/config.module.js'
import { LoggerModule } from '../../../core/logger/logger.module.js'
import { LinuxController } from './linux.controller.js'
import { LinuxService } from './linux.service.js'

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ConfigModule,
    LoggerModule,
  ],
  providers: [
    LinuxService,
  ],
  controllers: [
    LinuxController,
  ],
})
export class LinuxModule {}
