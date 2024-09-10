import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'

import { ConfigModule } from '../../../core/config/config.module'
import { LoggerModule } from '../../../core/logger/logger.module'
import { LinuxController } from './linux.controller'
import { LinuxService } from './linux.service'

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
