import { Controller, UseGuards, Get } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { StatusService } from './status.service';

@ApiTags('Server Status')
@ApiBearerAuth()
@UseGuards(AuthGuard())
@Controller('status')
export class StatusController {
  constructor(
    private readonly statusService: StatusService,
  ) { }

  @ApiOperation({ summary: 'Return the current CPU load, load history and temperature (if available).' })
  @Get('/cpu')
  getServerCpuInfo() {
    return this.statusService.getServerCpuInfo();
  }

  @ApiOperation({ summary: 'Return total memory, memory usage, and memory usage history in bytes.' })
  @Get('/ram')
  getServerMemoryInfo() {
    return this.statusService.getServerMemoryInfo();
  }

  @ApiOperation({ summary: 'Return transmist, receive history in bytes.' })
  @Get('/network')
  getServerNetworkInfo() {
    return this.statusService.getServerNetworkInfo();
  }

  @ApiOperation({ summary: 'Return the host and process (UI) uptime.' })
  @Get('/uptime')
  getServerUptimeInfo() {
    return this.statusService.getServerUptimeInfo();
  }

  @ApiOperation({
    summary: 'Return the current Homebridge status.',
    description: 'Possible Homebridge statuses are `up`, `pending` or `down`.'
  })
  @Get('/homebridge')
  async checkHomebridgeStatus() {
    return {
      status: await this.statusService.checkHomebridgeStatus(),
    };
  }

  @ApiOperation({
    summary: 'Return an array of the active child bridges and their status.',
    description: 'This method is only available when running `hb-service`.'
  })
  @Get('/homebridge/child-bridges')
  async getChildBridges() {
    return this.statusService.getChildBridges();
  }

  @ApiOperation({ summary: 'Return the current Homebridge version / package information.' })
  @Get('/homebridge-version')
  async getHomebridgeVersion() {
    return this.statusService.getHomebridgeVersion();
  }

  @ApiOperation({ summary: 'Return general information about the host environment.' })
  @Get('/server-information')
  async getHomebridgeServerInfo() {
    return this.statusService.getHomebridgeServerInfo();
  }

  @ApiOperation({ summary: 'Return current Node.js version and update availability information.' })
  @Get('/nodejs')
  async getNodeJsVersionInfo() {
    return this.statusService.getNodeJsVersionInfo();
  }
}
