import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

import { DirectConnectionConfig, DirectConnectionService } from './direct-connection.service.js'

@UseGuards(AuthGuard('jwt'))
@Controller('settings/direct-connection')
export class DirectConnectionController {
  constructor(
    @Inject(DirectConnectionService)
    private readonly directConnectionService: DirectConnectionService,
  ) { }

  @Get()
  getConfig(): Promise<DirectConnectionConfig> {
    return this.directConnectionService.getConfig()
  }

  @Get('login')
  login(): Promise<{ success: boolean, message: string }> {
    return this.directConnectionService.startLogin()
  }

  @Post()
  saveConfig(@Body() body: DirectConnectionConfig): Promise<DirectConnectionConfig> {
    return this.directConnectionService.saveConfig(body)
  }

  @Post('test')
  testConnection(): Promise<{ success: boolean, message: string }> {
    return this.directConnectionService.testConnection()
  }

  @Post('logout')
  async logout(): Promise<{ success: boolean, message: string }> {
    await this.directConnectionService.logout()
    return { success: true, message: 'Logged out successfully.' }
  }
}
