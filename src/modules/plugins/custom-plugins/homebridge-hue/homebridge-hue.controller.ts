import { Controller, UseGuards, Body, Get, Header } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from '../../../../core/auth/guards/admin.guard';
import { HomebridgeHueService } from './homebridge-hue.service';

@UseGuards(AuthGuard())
@Controller('plugins/custom-plugins/homebridge-hue')
export class HomebridgeHueController {

  constructor(
    private homebridgeHueService: HomebridgeHueService,
  ) { }

  @UseGuards(AdminGuard)
  @Get('/dump-file')
  @Header('Content-Type', 'application/json+gzip')
  async exchangeCredentials() {
    return this.homebridgeHueService.streamDumpFile();
  }

}
