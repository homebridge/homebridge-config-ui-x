import { Controller, Get, Header, UseGuards } from '@nestjs/common'

import { AuthGuard } from '@nestjs/passport'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import type { StreamableFile } from '@nestjs/common'

import { AdminGuard } from '../../../core/auth/guards/admin.guard'
import { HomebridgeDeconzService } from './homebridge-deconz.service'

@ApiTags('Plugins')
@ApiBearerAuth()
@UseGuards(AuthGuard())
@Controller('plugins/custom-plugins/homebridge-deconz')
export class HomebridgeDeconzController {
  constructor(
    private homebridgeDeconzService: HomebridgeDeconzService,
  ) {}

  @UseGuards(AdminGuard)
  @Get('/dump-file')
  @Header('Content-disposition', 'attachment; filename=homebridge-deconz.json.gz')
  @Header('Content-Type', 'application/json+gzip')
  async exchangeCredentials(): Promise<StreamableFile> {
    return this.homebridgeDeconzService.streamDumpFile()
  }
}
