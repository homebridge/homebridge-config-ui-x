import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { WsException } from '@nestjs/websockets'
import jwt from 'jsonwebtoken'

import { UserDto } from '../../../modules/users/users.dto.js'
import { ConfigService } from '../../config/config.service.js'
import { AuthService } from '../auth.service.js'
import { extractWsToken } from './ws-token.js'

/**
 * Guards the log stream.
 *
 * The Homebridge log has always been readable by any signed-in user, and that
 * stays the default. Plugin output routinely contains credentials in the clear,
 * though, so an admin can set `restrictLogsToAdmins` in the UI config to limit
 * it to administrators — at which point this behaves like WsAdminGuard.
 */
@Injectable()
export class WsLogGuard implements CanActivate {
  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    // ⚠️ Explicit @Inject: the dev server runs TypeScript through tsx (esbuild),
    // which does not emit `design:paramtypes`. Without the decorator Nest has no
    // type to resolve and injects undefined, so every socket message threw and
    // disconnected the client — a status page stuck on its spinner under
    // `npm run watch`, while a tsc-built release worked.
    @Inject(ModuleRef) private readonly moduleRef: ModuleRef,
  ) {}

  private get authService(): AuthService {
    return this.moduleRef.get(AuthService, { strict: false })
  }

  async canActivate(context: ExecutionContext) {
    const client = context.switchToWs().getClient()
    try {
      const payload = jwt.verify(extractWsToken(client.handshake), this.configService.secrets.secretKey) as UserDto & { instanceId?: string }

      if (payload?.instanceId !== this.configService.instanceId) {
        const isLiveWizardToken = payload?.username === 'setup-wizard'
          && this.configService.setupWizardComplete === false
        if (!isLiveWizardToken) {
          throw new Error('Stale token')
        }
      }

      if (!await this.authService.validateUser(payload)) {
        throw new Error('User no longer valid')
      }

      return this.configService.restrictLogsToAdmins ? Boolean(payload.admin) : true
    } catch (e) {
      client.disconnect()
      throw new WsException('Unauthorized')
    }
  }
}
