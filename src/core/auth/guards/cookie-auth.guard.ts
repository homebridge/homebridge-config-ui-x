import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'

import { ConfigService } from '../../config/config.service.js'

/**
 * Guard that authenticates requests to the custom plugin UI assets by verifying
 * the `hb-session` HttpOnly cookie set at login. This prevents unauthenticated
 * users from accessing iframe content served under /api/plugins/settings-ui/*.
 *
 * Access is allowed without a cookie only when authentication has been
 * explicitly disabled by the user (ui.auth === 'none').
 *
 * Note: UIX_INSECURE_MODE / homebridgeInsecureMode is intentionally NOT used
 * as a bypass here — hb-service sets it to '1' for all normal deployments.
 * The noauth endpoint (/api/auth/noauth) sets the hb-session cookie when auth
 * is disabled, so authenticated callers always have a valid cookie.
 */
@Injectable()
export class CookieAuthGuard implements CanActivate {
  constructor(
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // Allow unauthenticated access only when auth is explicitly disabled
    if (this.configService.ui.auth === 'none') {
      return true
    }

    const request = context.switchToHttp().getRequest()
    const token = this.extractTokenFromCookie(request.headers?.cookie)

    if (!token) {
      throw new UnauthorizedException()
    }

    try {
      // Mirror JwtStrategy.validate and the WS guards: a valid signature is not
      // enough — the token must be for this instance. The setup-wizard token is
      // signed with a sentinel instanceId, so it is accepted only while the
      // wizard is still in progress.
      const payload = this.jwtService.verify(token) as { instanceId?: string, username?: string }
      if (payload?.instanceId !== this.configService.instanceId) {
        const isLiveWizardToken = payload?.username === 'setup-wizard'
          && this.configService.setupWizardComplete === false
        if (!isLiveWizardToken) {
          throw new UnauthorizedException()
        }
      }
      return true
    } catch {
      throw new UnauthorizedException()
    }
  }

  /**
   * Parse the `hb-session` value from a raw Cookie header string.
   */
  private extractTokenFromCookie(cookieHeader: string | undefined): string | null {
    if (!cookieHeader) {
      return null
    }
    for (const part of cookieHeader.split(';')) {
      const eqIndex = part.indexOf('=')
      if (eqIndex === -1) {
        continue
      }
      const key = part.slice(0, eqIndex).trim()
      const value = part.slice(eqIndex + 1).trim()
      if (key === 'hb-session' && value) {
        return value
      }
    }
    return null
  }
}
