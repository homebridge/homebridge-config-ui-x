import { Controller, Get, UseGuards, Put, Header, Delete, Param, HttpCode, Body } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiParam, ApiOperation } from '@nestjs/swagger';

import { ServerService } from './server.service';
import { AdminGuard } from '../../core/auth/guards/admin.guard';
import { HomebridgeNetworkInterfacesDto } from './server.dto';

@ApiTags('Homebridge')
@ApiBearerAuth()
@UseGuards(AuthGuard())
@Controller('server')
export class ServerController {

  constructor(
    private serverService: ServerService,
  ) { }

  @Put('/restart')
  @ApiOperation({ summary: 'Restart the Homebridge instance.' })
  restartServer() {
    return this.serverService.restartServer();
  }

  @Get('/pairing')
  @ApiOperation({ summary: 'Get the Homebridge HomeKit pairing information and status.' })
  getBridgePairingInformation() {
    return this.serverService.getBridgePairingInformation();
  }

  @Get('/qrcode.svg')
  @ApiOperation({ summary: 'Return the paring QR code as an SVG.' })
  @Header('content-type', 'image/svg+xml')
  getQrCode() {
    return this.serverService.generateQrCode();
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Unpair / Reset the Homebridge instance and remove cached accessories.' })
  @Put('/reset-homebridge-accessory')
  resetHomebridgeAccessory() {
    return this.serverService.resetHomebridgeAccessory();
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Remove Homebridge cached accessories (hb-service only).' })
  @Put('/reset-cached-accessories')
  resetCachedAccessories() {
    return this.serverService.resetCachedAccessories();
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'List cached Homebridge accessories.' })
  @Get('/cached-accessories')
  getCachedAccessories() {
    return this.serverService.getCachedAccessories();
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Remove a single Homebridge cached accessory (hb-service only).' })
  @ApiParam({ name: 'uuid' })
  @Delete('/cached-accessories/:uuid')
  @HttpCode(204)
  deleteCachedAccessory(@Param('uuid') uuid: string) {
    return this.serverService.deleteCachedAccessory(uuid);
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'List all paired accessories (main bridge, external cameras, TVs etc).' })
  @Get('/pairings')
  getDevicePairings() {
    return this.serverService.getDevicePairings();
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Remove a single paired accessory (hb-service only).' })
  @ApiParam({ name: 'deviceId' })
  @Delete('/pairings/:deviceId')
  @HttpCode(204)
  deleteDevicePairing(@Param('deviceId') deviceId: string) {
    return this.serverService.deleteDevicePairing(deviceId);
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Return a list of available network interfaces on the server.' })
  @Get('/network-interfaces/system')
  getSystemNetworkInterfaces() {
    return this.serverService.getSystemNetworkInterfaces();
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Return a list of the network interface names assigned to Homebridge.' })
  @Get('/network-interfaces/bridge')
  getHomebridgeNetworkInterfaces() {
    return this.serverService.getHomebridgeNetworkInterfaces();
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Set a list of the network interface names assigned to Homebridge.' })
  @Put('/network-interfaces/bridge')
  setHomebridgeNetworkInterfaces(@Body() body: HomebridgeNetworkInterfacesDto) {
    return this.serverService.setHomebridgeNetworkInterfaces(body.adapters);
  }
}
