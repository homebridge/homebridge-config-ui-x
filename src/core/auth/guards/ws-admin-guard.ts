import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { WsException } from '@nestjs/websockets'
import jwt from 'jsonwebtoken'

import { UserDto } from '../../../modules/users/users.dto.js'
import { ConfigService } from '../../config/config.service.js'
import { AuthService } from '../auth.service.js'

@Injectable()
export class WsAdminGuard implements CanActivate {
  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    // ⚠️ Explicit @Inject: the dev server runs TypeScript through tsx (esbuild),
    // which does not emit `design:paramtypes`. Without the decorator Nest has no
    // type to resolve and injects undefined, so every socket message threw and
    // disconnected the client — a status page stuck on its spinner under
    // `npm run watch`, while a tsc-built release worked.
    @Inject(ModuleRef) private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * Resolved from the whole application context rather than injected: this
   * guard is built inside each gateway's own module, and those do not import
   * AuthModule. See the note in WsGuard.
   */
  private get authService(): AuthService {
    return this.moduleRef.get(AuthService, { strict: false })
  }

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
      // The payload's `admin` flag is a snapshot from when the token was
      // minted, so check it against the stored user too — otherwise a demoted
      // administrator would keep admin sockets until their token expired.
      if (!await this.authService.validateUser(user)) {
        throw new Error('User no longer valid')
      }
      return user.admin
    } catch (e) {
      client.disconnect()
      throw new WsException('Unauthorized')
    }
  }
}
