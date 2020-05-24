import { Controller, UseGuards, Get, Put, Body } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiExcludeEndpoint } from '@nestjs/swagger';
import { AdminGuard } from '../../../core/auth/guards/admin.guard';
import { DockerService } from './docker.service';

@ApiTags('Platform - Docker')
@ApiBearerAuth()
@UseGuards(AuthGuard())
@Controller('platform-tools/docker')
export class DockerController {
  constructor(
    private readonly dockerService: DockerService,
  ) { }

  @UseGuards(AdminGuard)
  @Get('startup-script')
  getStartupScript() {
    return this.dockerService.getStartupScript();
  }

  @UseGuards(AdminGuard)
  @Put('startup-script')
  updateStartupScript(@Body() body) {
    return this.dockerService.updateStartupScript(body.script);
  }

  @UseGuards(AdminGuard)
  @Put('restart-container')
  restartDockerContainer() {
    return this.dockerService.restartDockerContainer();
  }

  @ApiExcludeEndpoint()
  @UseGuards(AdminGuard)
  @Get('env')
  getDockerEnv() {
    return this.dockerService.getDockerEnv();
  }

  @ApiExcludeEndpoint()
  @UseGuards(AdminGuard)
  @Put('env')
  updateDockerEnv(@Body() body) {
    return this.dockerService.updateDockerEnv(body);
  }
}
