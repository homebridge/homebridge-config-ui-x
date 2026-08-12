import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'

import { PluginsModule } from '../../modules/plugins/plugins.module.js'
import { ConfigModule } from '../config/config.module.js'
import { ConfigService } from '../config/config.service.js'
import { FsModule } from '../fs/fs.module.js'
import { LoggerModule } from '../logger/logger.module.js'
import { AuthController } from './auth.controller.js'
import { AuthService } from './auth.service.js'
import { AdminGuard } from './guards/admin.guard.js'
import { WsAdminGuard } from './guards/ws-admin-guard.js'
import { WsLogGuard } from './guards/ws-log.guard.js'
import { WsGuard } from './guards/ws.guard.js'
import { JwtStrategy } from './jwt.strategy.js'

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
    PluginsModule,
    FsModule,
  ],
  providers: [
    AuthService,
    JwtStrategy,
    WsGuard,
    WsAdminGuard,
    WsLogGuard,
    AdminGuard,
  ],
  controllers: [
    AuthController,
  ],
  exports: [
    AuthService,
    AdminGuard,
    JwtModule,
  ],
})
export class AuthModule {}
