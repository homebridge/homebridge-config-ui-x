import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'

import { ConfigModule } from '../../core/config/config.module.js'
import { FsModule } from '../../core/fs/fs.module.js'
import { LoggerModule } from '../../core/logger/logger.module.js'
import { DirectConnectionController } from './direct-connection.controller.js'
import { DirectConnectionService } from './direct-connection.service.js'

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ConfigModule,
    LoggerModule,
    FsModule,
  ],
  controllers: [DirectConnectionController],
  providers: [DirectConnectionService],
  exports: [DirectConnectionService],
})
export class DirectConnectionModule {}
