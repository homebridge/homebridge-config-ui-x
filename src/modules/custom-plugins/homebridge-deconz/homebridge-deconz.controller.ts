import type { StreamableFile } from '@nestjs/common'

import { Controller, Get, Header, Inject, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'

import { AdminGuard } from '../../../core/auth/guards/admin.guard.js'
import { HomebridgeDeconzService } from './homebridge-deconz.service.js'

@ApiTags('Plugins')
@ApiBearerAuth()
@UseGuards(AuthGuard())
@Controller('plugins/custom-plugins/homebridge-deconz')
export class HomebridgeDeconzController {
  constructor(
    @Inject(HomebridgeDeconzService) private readonly homebridgeDeconzService: HomebridgeDeconzService,
  ) {}

  @UseGuards(AdminGuard)
  @Get('/dump-file')
  @Header('Content-disposition', 'attachment; filename=homebridge-deconz.json.gz')
  @Header('Content-Type', 'application/json+gzip')
  async exchangeCredentials(): Promise<StreamableFile> {
    return this.homebridgeDeconzService.streamDumpFile()
  }
}
