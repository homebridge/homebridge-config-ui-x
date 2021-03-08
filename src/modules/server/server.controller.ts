import { Controller, Get, UseGuards, Put, Header, Delete, Param, HttpCode, Body, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiParam, ApiOperation, ApiQuery } from '@nestjs/swagger';

import { ServerService } from './server.service';
import { AdminGuard } from '../../core/auth/guards/admin.guard';
import { HomebridgeMdnsSettingDto, HomebridgeNetworkInterfacesDto } from './server.dto';

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

  @UseGuards(AdminGuard)
  @Put('/restart/:deviceId')
  @ApiOperation({
    summary: 'Restart a child bridge instance.',
    description: 'This method is only supported on setups running hb-service.'
  })
  restartChildBridge(@Param('deviceId') deviceId: string) {
    return this.serverService.restartChildBridge(deviceId);
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
  @ApiQuery({ name: 'cacheFile' })
  @Delete('/cached-accessories/:uuid')
  @HttpCode(204)
  deleteCachedAccessory(@Param('uuid') uuid: string, @Query('cacheFile') cacheFile?: string) {
    return this.serverService.deleteCachedAccessory(uuid, cacheFile);
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'List all paired accessories (main bridge, external cameras, TVs etc).' })
  @Get('/pairings')
  getDevicePairings() {
    return this.serverService.getDevicePairings();
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get a single device paring' })
  @Get('/pairings/:deviceId')
  getDevicePairingById(@Param('deviceId') deviceId: string) {
    return this.serverService.getDevicePairingById(deviceId);
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
  @ApiOperation({ summary: 'Return a random, unused port.' })
  @Get('/port/new')
  lookupUnusedPort() {
    return this.serverService.lookupUnusedPort();
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

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Return the current mdns advertiser settings.' })
  @Get('/mdns-advertiser')
  getHomebridgeMdnsSetting(): Promise<HomebridgeMdnsSettingDto> {
    return this.serverService.getHomebridgeMdnsSetting();
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Set the mdns advertiser settings.' })
  @Put('/mdns-advertiser')
  setHomebridgeMdnsSetting(@Body() body: HomebridgeMdnsSettingDto) {
    return this.serverService.setHomebridgeMdnsSetting(body);
  }
}
