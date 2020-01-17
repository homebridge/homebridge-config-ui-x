import { Controller, Post, UseGuards, Body } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from '../../../../core/auth/guards/admin.guard';
import { HomebridgeRingService } from './homebridge-ring.service';

@UseGuards(AuthGuard())
@Controller('plugins/custom-plugins/homebridge-ring')
export class HomebridgeRingController {

  constructor(
    private homebridgeRingService: HomebridgeRingService,
  ) { }

  @UseGuards(AdminGuard)
  @Post('/exchange-credentials')
  async exchangeCredentials(@Body() body) {
    return this.homebridgeRingService.exchangeCredentials(body);
  }
}