import { Controller, Get, Inject, Param, Post, Query, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger'

import { AdminGuard } from '../../../core/auth/guards/admin.guard.js'
import { PluginsSettingsUiTicketService } from './plugins-settings-ui-ticket.service.js'
import { PluginsSettingsUiService } from './plugins-settings-ui.service.js'

@ApiTags('Plugins')
@Controller('plugins/settings-ui')
export class PluginsSettingsUiController {
  constructor(
    @Inject(PluginsSettingsUiService) private readonly pluginSettingsUiService: PluginsSettingsUiService,
    @Inject(PluginsSettingsUiTicketService) private readonly ticketService: PluginsSettingsUiTicketService,
  ) {}

  @Post('/:pluginName/ticket')
  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Issues a single-use ticket for a plugin custom UI.' })
  async issueTicket(@Req() request, @Param('pluginName') pluginName: string) {
    await this.pluginSettingsUiService.getPluginUiMetadata(pluginName)
    return {
      ticket: this.ticketService.issue(pluginName, request.user.username, request.headers?.origin, request.headers?.host),
      expiresIn: 60,
    }
  }

  @Get('/:pluginName/index.html')
  @ApiOperation({ summary: 'Redeems a single-use ticket and returns a plugin custom UI.' })
  async serveCustomUiIndex(
    @Req() request,
    @Res() reply,
    @Param('pluginName') pluginName: string,
    @Query('ticket') ticket?: string,
    @Query('v') version?: string,
  ) {
    const claims = this.ticketService.consume(ticket, pluginName)
    const assetSession = this.ticketService.issueAssetSession(pluginName, claims.username)
    this.setAssetSessionCookie(request, reply, assetSession)
    reply.header('Cache-Control', 'no-store, private')
    reply.header('Pragma', 'no-cache')
    reply.header('Referrer-Policy', 'no-referrer')
    return await this.pluginSettingsUiService.serveCustomUiAsset(reply, pluginName, 'index.html', claims.uiOrigin, version)
  }

  @Post('/:pluginName/session/revoke')
  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revokes the active custom-UI asset session.' })
  revokeAssetSession(@Req() request, @Res({ passthrough: true }) reply, @Param('pluginName') pluginName: string) {
    this.ticketService.revokeAssetSession(
      this.ticketService.extractAssetSession(request.headers?.cookie),
      pluginName,
    )
    this.setAssetSessionCookie(request, reply, '', 0)
    return { status: 'OK' }
  }

  @Get('/:pluginName/*')
  @ApiOperation({ summary: 'Returns a static asset for a plugin custom UI.' })
  @ApiParam({ name: 'pluginName', type: 'string' })
  async serveCustomUiAsset(@Req() request, @Res() reply, @Param('pluginName') pluginName, @Param('*') file, @Query('v') v?: string) {
    if (!file || /(?:^|\/)index\.html$/i.test(file) || /\.(?:html?|xhtml)$/i.test(file)) {
      throw new UnauthorizedException()
    }
    const token = this.ticketService.validateAssetSession(
      this.ticketService.extractAssetSession(request.headers?.cookie),
      pluginName,
    )
    this.setAssetSessionCookie(request, reply, token)
    return await this.pluginSettingsUiService.serveCustomUiAsset(reply, pluginName, file, '', v)
  }

  private setAssetSessionCookie(request, reply, token: string, maxAge = PluginsSettingsUiTicketService.assetSessionTtl) {
    // Build the scope from the known application prefix and route parameter;
    // never let encoded path text or query data influence a Set-Cookie Path.
    const cookiePath = `/api/plugins/settings-ui/${encodeURIComponent(request.params.pluginName)}/`
    const secure = request.protocol === 'https' ? '; Secure' : ''
    reply.header(
      'Set-Cookie',
      `hb-plugin-ui=${token}; HttpOnly; SameSite=Strict; Path=${cookiePath}; Max-Age=${maxAge}${secure}`,
    )
  }
}
