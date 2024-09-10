import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'

import { AuthModule } from '../../core/auth/auth.module'
import { ConfigModule } from '../../core/config/config.module'
import { LoggerModule } from '../../core/logger/logger.module'
import { UsersController } from './users.controller'

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
