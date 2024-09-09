import {
  Body,
  Controller,
  Get,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'

import { AdminGuard } from '../../../core/auth/guards/admin.guard'
import { HbServiceStartupSettings } from './hb-service.dto'
import { HbServiceService } from './hb-service.service'

@ApiTags('Platform - HB Service')
@ApiBearerAuth()
@UseGuards(AuthGuard())
@Controller('platform-tools/hb-service')
export class HbServiceController {
  constructor(
    private readonly hbServiceService: HbServiceService,
  ) {}

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Return the startup flags and env variables for Homebridge.' })
  @Get('homebridge-startup-settings')
  getHomebridgeStartupSettings() {
    return this.hbServiceService.getHomebridgeStartupSettings()
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Update the startup flags and env variables for Homebridge.' })
  @Put('homebridge-startup-settings')
  setHomebridgeStartupSettings(@Body() body: HbServiceStartupSettings) {
    return this.hbServiceService.setHomebridgeStartupSettings(body)
  }

  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Request the UI does a full restart next time a restart for Homebridge is sent.',
    description: 'When running under hb-service the UI will only restart if it detects it needs to.',
  })
  @Put('set-full-service-restart-flag')
  setFullServiceRestartFlag() {
    return this.hbServiceService.setFullServiceRestartFlag()
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Download the entire log file.' })
  @Get('log/download')
  @ApiQuery({ name: 'colour', enum: ['yes', 'no'], required: false })
  downloadLogFile(@Query('colour') colour?: string) {
    return this.hbServiceService.downloadLogFile((colour === 'yes'))
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Truncate / empty the log file.' })
  @Put('log/truncate')
  truncateLogFile(@Req() req) {
    return this.hbServiceService.truncateLogFile(req.user.username)
  }
}
