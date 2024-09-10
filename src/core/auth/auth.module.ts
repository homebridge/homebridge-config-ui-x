import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'

import { ConfigModule } from '../config/config.module'
import { ConfigService } from '../config/config.service'
import { LoggerModule } from '../logger/logger.module'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { AdminGuard } from './guards/admin.guard'
import { WsGuard } from './guards/ws.guard'
import { WsAdminGuard } from './guards/ws-admin-guard'
import { JwtStrategy } from './jwt.strategy'

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.secrets.secretKey,
        signOptions: {
          expiresIn: configService.ui.sessionTimeout,
        },
      }),
      inject: [ConfigService],
    }),
    ConfigModule,
    LoggerModule,
  ],
  providers: [
    AuthService,
    JwtStrategy,
    WsGuard,
    WsAdminGuard,
    AdminGuard,
  ],
  controllers: [
    AuthController,
  ],
  exports: [
    AuthService,
  ],
})
export class AuthModule {}
