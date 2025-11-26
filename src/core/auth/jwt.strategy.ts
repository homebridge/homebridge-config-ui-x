import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'

import { ConfigService } from '../config/config.service.js'
import { AuthService } from './auth.service.js'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.secrets.secretKey,
    })
  }

  async validate(payload: any) {
    const user = await this.authService.validateUser(payload)
    if (!user) {
      throw new UnauthorizedException()
    }
    return user
  }
}
