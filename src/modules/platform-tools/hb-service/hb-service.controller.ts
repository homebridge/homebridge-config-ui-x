import {
  Body,
  Controller,
  Get,
  Inject,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'

import { AdminGuard } from '../../../core/auth/guards/admin.guard.js'
import { HbServiceStartupSettings } from './hb-service.dto.js'
import { HbServiceService } from './hb-service.service.js'

@ApiTags('Platform - HB Service')
@ApiBearerAuth()
@UseGuards(AuthGuard())
@Controller('platform-tools/hb-service')
export class HbServiceController {
  constructor(
    @Inject(HbServiceService) private readonly hbServiceService: HbServiceService,
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
    description: 'The UI will only restart if it detects it needs to.',
  })
  @Put('set-full-service-restart-flag')
  setFullServiceRestartFlag() {
    return this.hbServiceService.setFullServiceRestartFlag()
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Download the entire log file.' })
  @Get('log/download')
  @ApiQuery({ name: 'color', enum: ['yes', 'no'], required: false, description: 'Same as colour, and wins when a request sends both.' })
  @ApiQuery({ name: 'colour', enum: ['yes', 'no'], required: false, description: 'Same as color.' })
  downloadLogFile(@Query('color') color?: string, @Query('colour') colour?: string) {
    // Both spellings are honored, since existing clients already send colour.
    return this.hbServiceService.downloadLogFile(((color ?? colour) !== 'yes'))
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Truncate/empty the log file.' })
  @Put('log/truncate')
  truncateLogFile(@Request() req) {
    return this.hbServiceService.truncateLogFile(req.user.username)
  }
}
