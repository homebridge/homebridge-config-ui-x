import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { WsException } from '@nestjs/websockets'
import jwt from 'jsonwebtoken'

import { UserDto } from '../../../modules/users/users.dto.js'
import { ConfigService } from '../../config/config.service.js'
import { AuthService } from '../auth.service.js'

@Injectable()
export class WsGuard implements CanActivate {
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
   * `@UseGuards(WsGuard)` makes Nest build this guard inside whichever module
   * declares the gateway, and those modules do not import AuthModule. Resolving
   * AuthService from the whole application context keeps the current-user check
   * available without adding AuthModule (and a circular import) to all of them.
   */
  private get authService(): AuthService {
    return this.moduleRef.get(AuthService, { strict: false })
  }

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
      // Also mirror the current-user check, so a deleted or demoted user's
      // token stops working on sockets as well as on HTTP.
      if (!await this.authService.validateUser(payload)) {
        throw new Error('User no longer valid')
      }
      return true
    } catch (e) {
      client.disconnect()
      throw new WsException('Unauthorized')
    }
  }
}
