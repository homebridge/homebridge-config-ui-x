import { Controller, Get, UseGuards, Put, Header, Delete, Param, HttpCode } from '@nestjs/common';
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

  @UseGuards(AdminGuard)
  @Get('/cached-accessories')
  getCachedAccessories() {
    return this.serverService.getCachedAccessories();
  }

  @UseGuards(AdminGuard)
  @Delete('/cached-accessories/:uuid')
  @HttpCode(204)
  deleteCachedAccessory(@Param('uuid') uuid: string) {
    return this.serverService.deleteCachedAccessory(uuid);
  }

  @UseGuards(AdminGuard)
  @Get('/pairings')
  getDevicePairings() {
    return this.serverService.getDevicePairings();
  }

  @UseGuards(AdminGuard)
  @Delete('/pairings/:deviceId')
  @HttpCode(204)
  deleteDevicePairing(@Param('deviceId') deviceId: string) {
    return this.serverService.deleteDevicePairing(deviceId);
  }

}
