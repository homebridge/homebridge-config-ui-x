import { Controller, UseGuards, Get, Put, Body, Res } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from '../../../core/auth/guards/admin.guard';
import { DockerService } from './docker.service';

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
  restartDockerContainer(@Res() res) {
    return this.dockerService.restartDockerContainer(res);
  }

  @UseGuards(AdminGuard)
  @Get('env')
  getDockerEnv() {
    return this.dockerService.getDockerEnv();
  }

  @UseGuards(AdminGuard)
  @Put('env')
  updateDockerEnv(@Body() body) {
    return this.dockerService.updateDockerEnv(body);
  }
}
