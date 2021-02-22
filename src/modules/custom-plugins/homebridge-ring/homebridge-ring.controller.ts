import { Controller, Post, UseGuards, Body } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AdminGuard } from '../../../core/auth/guards/admin.guard';
import { HomebridgeRingService } from './homebridge-ring.service';
import { HomebridgeRingCredentialsDto } from './homebridge-ring.dto';

@ApiTags('Plugins')
@ApiBearerAuth()
@UseGuards(AuthGuard())
@Controller('plugins/custom-plugins/homebridge-ring')
export class HomebridgeRingController {

  constructor(
    private homebridgeRingService: HomebridgeRingService,
  ) { }

  @UseGuards(AdminGuard)
  @Post('/exchange-credentials')
  async exchangeCredentials(@Body() body: HomebridgeRingCredentialsDto) {
    return this.homebridgeRingService.exchangeCredentials(body);
  }
}
