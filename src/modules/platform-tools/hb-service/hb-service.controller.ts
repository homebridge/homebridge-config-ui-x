import { Controller, UseGuards, Get, Put, Body } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
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
}
