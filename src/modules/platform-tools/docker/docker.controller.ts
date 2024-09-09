import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'

import { AdminGuard } from '../../../core/auth/guards/admin.guard'
import { DockerService } from './docker.service'

@ApiTags('Platform - Docker')
@ApiBearerAuth()
@UseGuards(AuthGuard())
@Controller('platform-tools/docker')
export class DockerController {
  constructor(
    private readonly dockerService: DockerService,
  ) {}

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Return the homebridge/homebridge docker image startup.sh file contents.' })
  @Get('startup-script')
  getStartupScript() {
    return this.dockerService.getStartupScript()
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Update the homebridge/homebridge docker image startup.sh file contents.' })
  @Put('startup-script')
  updateStartupScript(@Body() body) {
    return this.dockerService.updateStartupScript(body.script)
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Restart the homebridge/homebridge docker image container.' })
  @Put('restart-container')
  restartDockerContainer() {
    return this.dockerService.restartDockerContainer()
  }
}
