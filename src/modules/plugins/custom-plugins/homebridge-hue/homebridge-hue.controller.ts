import { Controller, UseGuards, Get, Header } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AdminGuard } from '../../../../core/auth/guards/admin.guard';
import { HomebridgeHueService } from './homebridge-hue.service';

@ApiTags('Plugins')
@ApiBearerAuth()
@UseGuards(AuthGuard())
@Controller('plugins/custom-plugins/homebridge-hue')
export class HomebridgeHueController {

  constructor(
    private homebridgeHueService: HomebridgeHueService,
  ) { }

  @UseGuards(AdminGuard)
  @Get('/dump-file')
  @Header('Content-disposition', 'attachment; filename=homebridge-hue.json.gz')
  @Header('Content-Type', 'application/json+gzip')
  async exchangeCredentials() {
    return this.homebridgeHueService.streamDumpFile();
  }

}
