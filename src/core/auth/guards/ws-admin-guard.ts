import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common'
import { WsException } from '@nestjs/websockets'
import jwt from 'jsonwebtoken'

import { UserDto } from '../../../modules/users/users.dto.js'
import { ConfigService } from '../../config/config.service.js'

@Injectable()
export class WsAdminGuard implements CanActivate {
  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const client = context.switchToWs().getClient()
    try {
      const user = jwt.verify(client.handshake.query.token, this.configService.secrets.secretKey) as UserDto & { instanceId?: string }
      // Reject mismatched instanceId — the setup-wizard token signs a
      // sentinel value and must not reach admin WS endpoints. Live wizard
      // tokens are still allowed *only* while the wizard is in progress.
      if (user?.instanceId !== this.configService.instanceId) {
        const isLiveWizardToken = user?.username === 'setup-wizard'
          && this.configService.setupWizardComplete === false
        if (!isLiveWizardToken) {
          throw new Error('Stale token')
        }
      }
      return user.admin
    } catch (e) {
      client.disconnect()
      throw new WsException('Unauthorized')
    }
  }
}
