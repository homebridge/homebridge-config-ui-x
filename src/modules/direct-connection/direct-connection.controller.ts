import { Body, Controller, Get, HttpCode, Inject, Post, Put, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'

import { AdminGuard } from '../../core/auth/guards/admin.guard.js'
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard.js'
import { DirectConnectionSettingsDto, DirectConnectionStatusDto } from './direct-connection.dto.js'
import { DirectConnectionService } from './direct-connection.service.js'

// Publishing the UI to the internet and holding Cloudflare account
// credentials is an administrator decision, so every route is admin-only.
@ApiTags('Direct Connection')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('settings/direct-connection')
export class DirectConnectionController {
  constructor(
    @Inject(DirectConnectionService) private readonly directConnectionService: DirectConnectionService,
  ) {}

  @ApiOperation({ summary: 'Get the Direct Connection settings and tunnel state.' })
  @ApiResponse({ type: DirectConnectionStatusDto, status: 200 })
  @Get()
  getStatus() {
    return this.directConnectionService.getStatus()
  }

  @ApiOperation({ summary: 'Update the Direct Connection settings. Only allowed while disconnected.' })
  @ApiBody({ type: DirectConnectionSettingsDto })
  @ApiResponse({ type: DirectConnectionStatusDto, status: 200 })
  @Put()
  updateSettings(@Body() body: DirectConnectionSettingsDto) {
    return this.directConnectionService.updateSettings(body.variant, body.hostname)
  }

  @ApiOperation({ summary: 'Start signing in to Cloudflare. Returns the authorisation link to open.' })
  @ApiResponse({ type: DirectConnectionStatusDto, status: 200 })
  @HttpCode(200)
  @Post('login')
  startLogin() {
    return this.directConnectionService.startLogin()
  }

  @ApiOperation({ summary: 'Stop the tunnel and remove the Cloudflare credentials from this server.' })
  @ApiResponse({ type: DirectConnectionStatusDto, status: 200 })
  @HttpCode(200)
  @Post('logout')
  logout() {
    return this.directConnectionService.logout()
  }

  @ApiOperation({ summary: 'Start the tunnel and keep it running across restarts.' })
  @ApiResponse({ type: DirectConnectionStatusDto, status: 200 })
  @HttpCode(200)
  @Post('connect')
  connect() {
    return this.directConnectionService.connect()
  }

  @ApiOperation({ summary: 'Stop the tunnel and keep it off across restarts.' })
  @ApiResponse({ type: DirectConnectionStatusDto, status: 200 })
  @HttpCode(200)
  @Post('disconnect')
  disconnect() {
    return this.directConnectionService.disconnect()
  }
}
