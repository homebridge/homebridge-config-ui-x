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
    @Res() reply,
    @Param('pluginName') pluginName: string,
    @Query('ticket') ticket?: string,
    @Query('v') version?: string,
  ) {
    const claims = this.ticketService.consume(ticket, pluginName)
    reply.header('Cache-Control', 'no-store, private')
    reply.header('Pragma', 'no-cache')
    reply.header('Referrer-Policy', 'no-referrer')
    return await this.pluginSettingsUiService.serveCustomUiAsset(reply, pluginName, 'index.html', claims.uiOrigin, version)
  }

  @Get('/:pluginName/*')
  @ApiOperation({ summary: 'Returns a static asset for a plugin custom UI.' })
  @ApiParam({ name: 'pluginName', type: 'string' })
  async serveCustomUiAsset(@Res() reply, @Param('pluginName') pluginName, @Param('*') file, @Query('v') v?: string) {
    if (!file || file === 'index.html') {
      throw new UnauthorizedException()
    }
    return await this.pluginSettingsUiService.serveCustomUiAsset(reply, pluginName, file, '', v)
  }
}
