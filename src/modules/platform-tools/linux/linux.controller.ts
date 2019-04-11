import { Controller, UseGuards, Res, Put } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { LinuxService } from './linux.service';
import { AdminGuard } from '../../../core/auth/guards/admin.guard';

@UseGuards(AuthGuard())
@Controller('platform-tools/linux')
export class LinuxController {
  constructor(
    private readonly linuxServer: LinuxService,
  ) { }

  @UseGuards(AdminGuard)
  @Put('restart-host')
  restartHost(@Res() res) {
    return this.linuxServer.restartHost(res);
  }

  @UseGuards(AdminGuard)
  @Put('shutdown-host')
  shutdownHost(@Res() res) {
    return this.linuxServer.shutdownHost(res);
  }
}
