import { Controller, Get, Header, UseGuards } from '@nestjs/common'

import { AuthGuard } from '@nestjs/passport'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import type { StreamableFile } from '@nestjs/common'

import { AdminGuard } from '../../../core/auth/guards/admin.guard'
import { HomebridgeHueService } from './homebridge-hue.service'

@ApiTags('Plugins')
@ApiBearerAuth()
@UseGuards(AuthGuard())
@Controller('plugins/custom-plugins/homebridge-hue')
export class HomebridgeHueController {
  constructor(
    private homebridgeHueService: HomebridgeHueService,
  ) {}

  @UseGuards(AdminGuard)
  @Get('/dump-file')
  @Header('Content-disposition', 'attachment; filename=homebridge-hue.json.gz')
  @Header('Content-Type', 'application/json+gzip')
  async exchangeCredentials(): Promise<StreamableFile> {
    return this.homebridgeHueService.streamDumpFile()
  }
}
