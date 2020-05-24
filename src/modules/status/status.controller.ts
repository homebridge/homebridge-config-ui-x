import { Controller, UseGuards, Get } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { StatusService } from './status.service';

@ApiTags('Server Status')
@ApiBearerAuth()
@UseGuards(AuthGuard())
@Controller('status')
export class StatusController {
  constructor(
    private readonly statusService: StatusService,
  ) { }

  @Get('/cpu')
  getServerCpuInfo() {
    return this.statusService.getServerCpuInfo();
  }

  @Get('/ram')
  getServerMemoryInfo() {
    return this.statusService.getServerMemoryInfo();
  }

  @Get('/uptime')
  getServerUptimeInfo() {
    return this.statusService.getServerUptimeInfo();
  }

  @Get('/homebridge')
  async checkHomebridgeStatus() {
    return {
      status: await this.statusService.checkHomebridgeStatus(),
    };
  }

  @Get('/server-information')
  async getHomebridgeServerInfo() {
    return this.statusService.getHomebridgeServerInfo();
  }

  @Get('/nodejs')
  async getNodeJsVersionInfo() {
    return this.statusService.getNodeJsVersionInfo();
  }
}
