import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Post,
  Request,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { AuthGuard } from '@nestjs/passport'
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger'

import { PluginsSettingsUiTicketService } from '../../modules/custom-plugins/plugins-settings-ui/plugins-settings-ui-ticket.service.js'
import { PluginsService } from '../../modules/plugins/plugins.service.js'
import { API_PREFIX } from '../api.constants.js'
import { ConfigService } from '../config/config.service.js'
import { Logger } from '../logger/logger.service.js'
import { AuthDto, RefreshTokenDto } from './auth.dto.js'
import { AuthService } from './auth.service.js'
import { CustomGuard } from './guards/custom.guard.js'

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(PluginsService) private readonly pluginsService: PluginsService,
    @Inject(PluginsSettingsUiTicketService) private readonly pluginUiTicketService: PluginsSettingsUiTicketService,
    @Inject(Logger) private readonly logger: Logger,
    @Inject(JwtService) private readonly jwtService: JwtService,
  ) {}

  @ApiOperation({ summary: 'Exchange a username and password for an authentication token.' })
  @Post('login')
  async signIn(@Body() body: AuthDto, @Request() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    const result = await this.authService.signIn(body.username, body.password, body.otp, req.ip)
    this.setRefreshCookie(res, result.access_token, req.protocol === 'https')
    return result
  }

  @Get('/settings')
  @ApiOperation({ summary: 'Return settings required to load the UI before authentication.' })
  @UseGuards(CustomGuard)
  getSettings(@Request() req: any) {
    const settings: any = this.configService.uiSettings(req.user)
    // Inline a flag the accessories page uses to gate its "no plugins" empty state,
    // so it doesn't need a separate GET /plugins call on every mount.
    //
    // This endpoint is on the bootstrap/login critical path: the UI awaits it
    // before navigating after login and the route guards await it on refresh.
    // It must never block on the installed-plugins filesystem walk, so we only
    // read the flag from the warm cache and never trigger the scan inline.
    // Skip entirely while a plugin install/uninstall is in flight — the cache
    // is mid-flux, and `true` (the UI default when the flag is absent) is the
    // safe answer for the empty state anyway.
    if (req.user && !this.pluginsService.isPluginManagementInProgress) {
      const cachedPlugins = this.pluginsService.getCachedInstalledPlugins()
      if (cachedPlugins) {
        settings.env.hasInstalledPlugins = cachedPlugins.some(p => p.name !== this.configService.name)
      } else {
        // Cache miss: return immediately without the flag and warm the cache
        // in the background so the next settings load has it. The UI defaults
        // to `true` (show the accessories grid) while the flag is absent.
        void this.pluginsService.getInstalledPlugins().catch((e: any) => {
          this.logger.error(`Failed to warm installed-plugins cache for /auth/settings: ${e.message}.`)
        })
      }
    }
    return settings
  }

  @ApiExcludeEndpoint()
  @Get('/wallpaper/:hash')
  @Header('Content-Type', 'image/jpeg')
  @Header('Cache-Control', 'public,max-age=31536000,immutable')
  getCustomWallpaper() {
    return this.configService.streamCustomWallpaper()
  }

  @ApiOperation({ summary: 'This method can be used to obtain an access token ONLY when authentication has been disabled.' })
  @Post('/noauth')
  async getToken(@Request() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    const result = await this.authService.generateNoAuthToken()
    this.setRefreshCookie(res, result.access_token, req.protocol === 'https')
    return result
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check to see if an authentication token is still valid.' })
  @UseGuards(AuthGuard())
  @Get('/check')
  checkAuth() {
    return { status: 'OK' }
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Refresh the authentication token to extend the session.' })
  @UseGuards(AuthGuard())
  @Post('/refresh')
  async refreshToken(
    @Request() req: any,
    @Body() body: RefreshTokenDto = {},
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const result = await this.authService.refreshToken(req.user, body.reason)
    this.setRefreshCookie(res, result.access_token, req.protocol === 'https')
    return result
  }

  @ApiOperation({
    summary: 'Exchange the HttpOnly session cookie for an access token.',
    description: 'Called on page load so the access token never has to be persisted in browser storage.',
  })
  @Post('/session')
  async restoreSession(@Request() req: any, @Res({ passthrough: true }) res: FastifyReply) {
    try {
      const payload = this.readRefreshCookie(req.headers?.cookie)
      if (!payload) {
        throw new UnauthorizedException()
      }
      const result = await this.authService.refreshToken(payload, 'session-restore')
      this.setRefreshCookie(res, result.access_token, req.protocol === 'https')
      return result
    } catch (e) {
      // A rejected cookie never restores anything again, but the browser keeps
      // re-presenting it on every page load until its Max-Age runs out. Clear
      // it alongside the 401 so the retries stop.
      if (req.headers?.cookie?.includes('hb-refresh=')) {
        res.header('Set-Cookie', this.buildClearedCookies(req.protocol === 'https'))
      }
      throw e
    }
  }

  @ApiOperation({ summary: 'Clear the session cookies.' })
  @ApiBearerAuth()
  @UseGuards(CustomGuard)
  @Post('/logout')
  async logout(@Request() req: FastifyRequest & { user?: { username: string } }, @Res({ passthrough: true }) res: FastifyReply) {
    // Only a currently valid user token may revoke all of that user's tokens.
    // The fallback below accepts expired tokens solely to clean up plugin UI
    // tickets; allowing one to increment sessionVersion would give any token
    // captured in the past a permanent account-logout primitive.
    if (req.user?.username) {
      await this.authService.revokeUserSessions(req.user.username)
    }
    const username = req.user?.username ?? this.readLogoutUsername(req.headers.authorization)
    const pluginNames = username
      ? this.pluginUiTicketService.revokeUser(username)
      : []
    res.header('Set-Cookie', this.buildClearedCookies(req.protocol === 'https', pluginNames))
    return { status: 'OK' }
  }

  /**
   * Verify the hb-refresh cookie and return its payload, or null. The token is
   * checked exactly as a Bearer token would be, including the per-instance and
   * current-user checks, so a stale or revoked cookie restores nothing.
   */
  private readRefreshCookie(cookieHeader?: string): any | null {
    if (!cookieHeader) {
      return null
    }
    for (const part of cookieHeader.split(';')) {
      const eq = part.indexOf('=')
      if (eq === -1) {
        continue
      }
      if (part.slice(0, eq).trim() !== 'hb-refresh') {
        continue
      }
      const value = part.slice(eq + 1).trim()
      if (!value) {
        return null
      }
      try {
        return this.jwtService.verify(value)
      } catch {
        return null
      }
    }
    return null
  }

  /**
   * Recover a revocation identity from a signed Bearer token when normal
   * authentication rejected it only because it expired. This never grants
   * access; it is used solely to delete that user's plugin UI tickets.
   */
  private readLogoutUsername(authorization?: string): string | undefined {
    const [scheme, token] = authorization?.split(' ') ?? []
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return undefined
    }
    try {
      const payload = this.jwtService.verify(token, { ignoreExpiration: true })
      return typeof payload?.username === 'string' ? payload.username : undefined
    } catch {
      return undefined
    }
  }

  private setRefreshCookie(res: FastifyReply, token: string, secure: boolean) {
    res.header('Set-Cookie', this.buildRefreshCookie(token, secure))
  }

  /**
   * Build the Set-Cookie header for the hb-refresh cookie.
   *
   * This is what lets the access token live only in memory in the browser: on
   * page load the UI exchanges this cookie for a fresh token instead of reading
   * one back out of localStorage, where any script on the page could read it.
   *
   * HttpOnly keeps it away from JavaScript, and Path is scoped to the single
   * endpoint that consumes it so it is not attached to ordinary API calls.
   * SameSite=Strict means a cross-site page cannot trigger the exchange, and
   * the API itself still authenticates with a Bearer header, so widening this
   * does not introduce a CSRF path.
   */
  private buildRefreshCookie(token: string, secure: boolean): string {
    const maxAge = this.configService.ui.sessionTimeout || 28800
    const secureFlag = secure ? '; Secure' : ''
    return `hb-refresh=${token}; HttpOnly; SameSite=Strict; Path=${API_PREFIX}/auth/session; Max-Age=${maxAge}${secureFlag}`
  }

  /**
   * Clear the refresh cookie. Used by logout — without this the browser would
   * still hold a valid refresh cookie and the next page load would silently
   * restore the session the user just ended.
   */
  private buildClearedCookies(secure: boolean, pluginNames: string[] = []): string[] {
    const secureFlag = secure ? '; Secure' : ''
    return [
      `hb-refresh=; HttpOnly; SameSite=Strict; Path=${API_PREFIX}/auth/session; Max-Age=0${secureFlag}`,
      ...pluginNames.map(pluginName => `hb-plugin-ui=; HttpOnly; SameSite=Strict; Path=${API_PREFIX}/plugins/settings-ui/${encodeURIComponent(pluginName)}/; Max-Age=0${secureFlag}`),
    ]
  }
}
