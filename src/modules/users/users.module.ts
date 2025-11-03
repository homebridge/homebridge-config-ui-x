import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'

import { AuthModule } from '../../core/auth/auth.module.js'
import { ConfigModule } from '../../core/config/config.module.js'
import { LoggerModule } from '../../core/logger/logger.module.js'
import { UsersController } from './users.controller.js'

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ConfigModule,
    LoggerModule,
    AuthModule,
  ],
  controllers: [UsersController],
})
export class UsersModule {}
