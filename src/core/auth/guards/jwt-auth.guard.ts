import type { ExecutionContext } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'

import { Inject, Injectable, Optional } from '@nestjs/common'
import { AuthGuard, AuthModuleOptions } from '@nestjs/passport'

import { Logger } from '../../logger/logger.service.js'
import { extractBearerToken } from '../jwt.strategy.js'

/**
 * The browser drops its session on the first 401, so a proxy that strips the
 * header produces one rejection per sign-in. A script or monitor polling
 * without a token would otherwise write a line on every request.
 */
const MISSING_TOKEN_WARNING_INTERVAL_MS = 10 * 60 * 1000

/** An HTTP auth-scheme token. Anything else is not echoed into the log. */
const RE_AUTH_SCHEME = /^[\w!#$%&'*+.^`|~-]{1,32}$/

/**
 * Describe why the request had no usable bearer token, without the credential.
 * @param authorization - the raw Authorization header, if any
 */
export function describeMissingToken(authorization: string | undefined): string {
  if (!authorization) {
    return 'the request had no Authorization header'
  }
  const scheme = authorization.trim().split(/\s+/, 1)[0]
  if (scheme.toLowerCase() === 'bearer') {
    return 'the Authorization header had no token after "Bearer"'
  }
  return RE_AUTH_SCHEME.test(scheme)
    ? `the Authorization header used the "${scheme}" scheme instead of "Bearer"`
    : 'the Authorization header was not a bearer token'
}

/**
 * The guard for every HTTP route that needs a signed-in user.
 *
 * It rejects exactly what `AuthGuard('jwt')` rejects. The addition is a warning
 * when the token is missing rather than invalid. The UI always sends one once
 * signed in, so a missing token on a guarded route usually means something
 * between the browser and the server removed or replaced the header - most
 * often a reverse proxy. Without the warning the user only sees the UI sign
 * them out, and the log says nothing.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private static lastMissingTokenWarningAt = Number.NEGATIVE_INFINITY

  // Every param needs its own @Inject: tsx emits no design:paramtypes, and
  // Nest 12 no longer inherits the mixin's @Optional marker.
  constructor(
    @Optional() @Inject(AuthModuleOptions) options: AuthModuleOptions | undefined,
    @Inject(Logger) private readonly logger: Logger,
  ) {
    super(options)
  }

  handleRequest<TUser = any>(err: any, user: any, info: any, context: ExecutionContext, status?: any): TUser {
    if (!user) {
      const request = context.switchToHttp().getRequest<FastifyRequest>()
      if (!extractBearerToken(request)) {
        this.warnMissingToken(request)
      }
    }
    return super.handleRequest(err, user, info, context, status)
  }

  private warnMissingToken(request: FastifyRequest) {
    const now = Date.now()
    if (now - JwtAuthGuard.lastMissingTokenWarningAt < MISSING_TOKEN_WARNING_INTERVAL_MS) {
      return
    }
    JwtAuthGuard.lastMissingTokenWarningAt = now

    const path = request.url.split('?', 1)[0]
    this.logger.warn(
      `Rejected ${request.method} ${path}: ${describeMissingToken(request.headers.authorization)}. `
      + 'If you open the UI through a reverse proxy, check that it passes the Authorization header through to Homebridge.',
    )
  }
}
