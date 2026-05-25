import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common'
import jwt from 'jsonwebtoken'

import { UserDto } from '../../../modules/users/users.dto.js'
import { ConfigService } from '../../config/config.service.js'

@Injectable()
export class WsGuard implements CanActivate {
  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const client = context.switchToWs().getClient()
    try {
      const payload = jwt.verify(client.handshake.query.token, this.configService.secrets.secretKey) as UserDto & { instanceId?: string }
      // Mirror JwtStrategy.validate — reject mismatched instanceId so the
      // setup-wizard token (intentionally signed with a wrong instanceId)
      // cannot reach socket endpoints once the wizard has completed.
      if (payload?.instanceId !== this.configService.instanceId) {
        const isLiveWizardToken = payload?.username === 'setup-wizard'
          && this.configService.setupWizardComplete === false
        if (!isLiveWizardToken) {
          throw new Error('Stale token')
        }
      }
      return true
    } catch (e) {
      client.disconnect()
      return false
    }
  }
}
