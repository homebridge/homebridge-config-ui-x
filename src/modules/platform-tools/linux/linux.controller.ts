import { Controller, UseGuards, Put } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { LinuxService } from './linux.service';
import { AdminGuard } from '../../../core/auth/guards/admin.guard';

@ApiTags('Platform - Linux')
@ApiBearerAuth()
@UseGuards(AuthGuard())
@Controller('platform-tools/linux')
export class LinuxController {
  constructor(
    private readonly linuxServer: LinuxService,
  ) { }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Restart / reboot the host server.' })
  @Put('restart-host')
  restartHost() {
    return this.linuxServer.restartHost();
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Shutdown / power off the host server.' })
  @Put('shutdown-host')
  shutdownHost() {
    return this.linuxServer.shutdownHost();
  }
}
