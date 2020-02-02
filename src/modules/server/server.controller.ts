import { Controller, Get, UseGuards, Res, Put, Req, Header } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ServerService } from './server.service';
import { AdminGuard } from '../../core/auth/guards/admin.guard';

@UseGuards(AuthGuard())
@Controller('server')
export class ServerController {

  constructor(
    private serverService: ServerService,
  ) { }

  @Put('/restart')
  restartServer() {
    return this.serverService.restartServer();
  }

  @Get('/qrcode.svg')
  @Header('content-type', 'image/svg+xml')
  getQrCode() {
    return this.serverService.generateQrCode();
  }

  @UseGuards(AdminGuard)
  @Put('/reset-homebridge-accessory')
  resetHomebridgeAccessory() {
    return this.serverService.resetHomebridgeAccessory();
  }

  @UseGuards(AdminGuard)
  @Put('/reset-cached-accessories')
  resetCachedAccessories() {
    return this.serverService.resetCachedAccessories();
  }

}
