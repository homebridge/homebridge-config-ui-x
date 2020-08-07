import { Controller, UseGuards, Get, Put, Body, Req, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AdminGuard } from '../../../core/auth/guards/admin.guard';
import { HbServiceService } from './hb-service.service';

@ApiTags('Platform - HB Service')
@ApiBearerAuth()
@UseGuards(AuthGuard())
@Controller('platform-tools/hb-service')
export class HbServiceController {
  constructor(
    private readonly hbServiceService: HbServiceService,
  ) { }

  @UseGuards(AdminGuard)
  @Get('homebridge-startup-settings')
  getHomebridgeStartupSettings() {
    return this.hbServiceService.getHomebridgeStartupSettings();
  }

  @UseGuards(AdminGuard)
  @Put('homebridge-startup-settings')
  setHomebridgeStartupSettings(@Body() body) {
    return this.hbServiceService.setHomebridgeStartupSettings(body);
  }

  @UseGuards(AdminGuard)
  @Put('set-full-service-restart-flag')
  setFullServiceRestartFlag() {
    return this.hbServiceService.setFullServiceRestartFlag();
  }

  @UseGuards(AdminGuard)
  @Get('log/download')
  @ApiQuery({ name: 'colour', enum: ['yes', 'no'], required: false })
  downloadLogFile(@Query('colour') colour?: string) {
    return this.hbServiceService.downloadLogFile((colour === 'yes'));
  }

  @UseGuards(AdminGuard)
  @Put('log/truncate')
  truncateLogFile(@Req() req) {
    return this.hbServiceService.truncateLogFile(req.user.username);
  }
}
