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
    // Reject tokens whose `instanceId` doesn't match this server. The
    // setup-wizard token is signed with a sentinel `instanceId: 'xxxxx'`
    // and carries `admin: true`, so it must only unlock requests while the
    // wizard is still in progress — otherwise its 5-minute window would
    // grant full admin access to every endpoint after first-user setup.
    if (payload?.instanceId !== this.configService.instanceId) {
      const isLiveWizardToken = payload?.username === 'setup-wizard'
        && this.configService.setupWizardComplete === false
      if (!isLiveWizardToken) {
        throw new UnauthorizedException()
      }
    }
    const user = await this.authService.validateUser(payload)
    if (!user) {
      throw new UnauthorizedException()
    }
    return user
  }
}
