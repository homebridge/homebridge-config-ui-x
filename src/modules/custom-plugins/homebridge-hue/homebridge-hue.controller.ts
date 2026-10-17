import type { StreamableFile } from '@nestjs/common'

import { Controller, Get, Header, Inject, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'

import { AdminGuard } from '../../../core/auth/guards/admin.guard.js'
import { JwtAuthGuard } from '../../../core/auth/guards/jwt-auth.guard.js'
import { HomebridgeHueService } from './homebridge-hue.service.js'

@ApiTags('Plugins')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('plugins/custom-plugins/homebridge-hue')
export class HomebridgeHueController {
  constructor(
    @Inject(HomebridgeHueService) private readonly homebridgeHueService: HomebridgeHueService,
  ) {}

  @UseGuards(AdminGuard)
  @Get('/dump-file')
  @Header('Content-disposition', 'attachment; filename=homebridge-hue.json.gz')
  @Header('Content-Type', 'application/json+gzip')
  async exchangeCredentials(): Promise<StreamableFile> {
    return this.homebridgeHueService.streamDumpFile()
  }
}
