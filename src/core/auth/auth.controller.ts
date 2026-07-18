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
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger'

import { PluginsService } from '../../modules/plugins/plugins.service.js'
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
    @Inject(Logger) private readonly logger: Logger,
  ) {}

  @ApiOperation({ summary: 'Exchange a username and password for an authentication token.' })
  @Post('login')
  async signIn(@Body() body: AuthDto, @Request() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    const result = await this.authService.signIn(body.username, body.password, body.otp)
    res.header('Set-Cookie', this.buildSessionCookie(result.access_token, req.protocol === 'https'))
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
    res.header('Set-Cookie', this.buildSessionCookie(result.access_token, req.protocol === 'https'))
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
    res.header('Set-Cookie', this.buildSessionCookie(result.access_token, req.protocol === 'https'))
    return result
  }

  /**
   * Build the Set-Cookie header value for the hb-session cookie.
   * HttpOnly prevents client-side JavaScript from reading the token.
   * SameSite=Strict prevents cross-site request forgery.
   * Path is scoped to the plugin settings-ui route so the browser only
   * sends this cookie for requests to /api/plugins/settings-ui/* and does
   * not attach it to every other API request.
   * Secure is added when the request arrived over HTTPS so the browser
   * will not transmit the cookie over plain HTTP connections.
   */
  private buildSessionCookie(token: string, secure: boolean): string {
    const maxAge = this.configService.ui.sessionTimeout || 28800
    const secureFlag = secure ? '; Secure' : ''
    return `hb-session=${token}; HttpOnly; SameSite=Strict; Path=/api/plugins/settings-ui/; Max-Age=${maxAge}${secureFlag}`
  }
}
