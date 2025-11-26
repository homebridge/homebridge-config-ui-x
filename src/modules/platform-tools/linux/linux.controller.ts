import { Controller, Inject, Put, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'

import { AdminGuard } from '../../../core/auth/guards/admin.guard.js'
import { LinuxService } from './linux.service.js'

@ApiTags('Platform - Linux')
@ApiBearerAuth()
@UseGuards(AuthGuard())
@Controller('platform-tools/linux')
export class LinuxController {
  constructor(
    @Inject(LinuxService) private readonly linuxServer: LinuxService,
  ) {}

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Restart the host server.' })
  @Put('restart-host')
  restartHost() {
    return this.linuxServer.restartHost()
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Shutdown the host server.' })
  @Put('shutdown-host')
  shutdownHost() {
    return this.linuxServer.shutdownHost()
  }
}
