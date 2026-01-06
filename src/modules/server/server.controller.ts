import type { FastifyRequest } from 'fastify'

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  Inject,
  InternalServerErrorException,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger'

import { AdminGuard } from '../../core/auth/guards/admin.guard.js'
import { Logger } from '../../core/logger/logger.service.js'
import { ChildBridgesService } from '../child-bridges/child-bridges.service.js'
import { HomebridgeMdnsSettingDto, HomebridgeNetworkInterfacesDto } from './server.dto.js'
import { ServerService } from './server.service.js'

@ApiTags('Homebridge')
@ApiBearerAuth()
@UseGuards(AuthGuard())
@Controller('server')
export class ServerController {
  constructor(
    @Inject(ServerService) private readonly serverService: ServerService,
    @Inject(ChildBridgesService) private readonly childBridgesService: ChildBridgesService,
    @Inject(Logger) private readonly logger: Logger,
  ) {}

  @Put('/restart')
  @ApiOperation({ summary: 'Restart the Homebridge instance.' })
  restartServer() {
    return this.serverService.restartServer()
  }

  @UseGuards(AdminGuard)
  @Put('/restart/:deviceId')
  @ApiOperation({
    summary: 'Restart a child bridge instance.',
  })
  restartChildBridge(@Param('deviceId') deviceId: string) {
    return this.childBridgesService.restartChildBridge(deviceId)
  }

  @UseGuards(AdminGuard)
  @Put('/stop/:deviceId')
  @ApiOperation({
    summary: 'Stop a child bridge instance.',
  })
  stopChildBridge(@Param('deviceId') deviceId: string) {
    return this.childBridgesService.stopChildBridge(deviceId)
  }

  @UseGuards(AdminGuard)
  @Put('/start/:deviceId')
  @ApiOperation({
    summary: 'Start a child bridge instance.',
  })
  startChildBridge(@Param('deviceId') deviceId: string) {
    return this.childBridgesService.startChildBridge(deviceId)
  }

  @Get('/pairing')
  @ApiOperation({ summary: 'Get the Homebridge <> HomeKit pairing information and status.' })
  getBridgePairingInformation() {
    return this.serverService.getBridgePairingInformation()
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Reset the main Homebridge bridge, and change its username and pin. Also remove cached bridges and accessories.' })
  @Put('/reset-homebridge-accessory')
  resetHomebridgeAccessory() {
    return this.serverService.resetHomebridgeAccessory()
  }

  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Remove Homebridge cached accessories.',
  })
  @Put('/reset-cached-accessories')
  deleteAllCachedAccessories() {
    return this.serverService.deleteAllCachedAccessories()
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'List cached Homebridge accessories.' })
  @Get('/cached-accessories')
  getCachedAccessories() {
    return this.serverService.getCachedAccessories()
  }

  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Remove a single Homebridge cached accessory.',
  })
  @ApiParam({ name: 'uuid' })
  @ApiQuery({ name: 'cacheFile' })
  @Delete('/cached-accessories/:uuid')
  @HttpCode(204)
  deleteCachedAccessory(@Param('uuid') uuid: string, @Query('cacheFile') cacheFile?: string) {
    return this.serverService.deleteCachedAccessory(uuid, cacheFile)
  }

  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Remove multiple Homebridge cached accessories.',
  })
  @ApiBody({ description: 'Array of accessories (uuid and cacheFile) to remove from the cache', type: 'json', isArray: true })
  @Delete('/cached-accessories')
  @HttpCode(204)
  deleteCachedAccessories(@Body() accessories?: { uuid: string, cacheFile: string }[]) {
    return this.serverService.deleteCachedAccessories(accessories)
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'List all paired accessories (main bridge, external cameras, TVs etc).' })
  @Get('/pairings')
  getDevicePairings() {
    return this.serverService.getDevicePairings()
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get a single device pairing.' })
  @Get('/pairings/:deviceId')
  getDevicePairingById(@Param('deviceId') deviceId: string) {
    return this.serverService.getDevicePairingById(deviceId)
  }

  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Remove a single paired bridge.',
  })
  @ApiParam({ name: 'deviceId' })
  @ApiQuery({ name: 'resetPairingInfo', type: Boolean })
  @Delete('/pairings/:deviceId')
  @HttpCode(204)
  deleteDevicePairing(@Param('deviceId') deviceId: string, @Query('resetPairingInfo') resetPairingInfo?: string) {
    const resetPairingInfoBool = resetPairingInfo === 'true'
    return this.serverService.deleteDevicePairing(deviceId, resetPairingInfoBool)
  }

  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Remove multiple paired bridges.',
  })
  @ApiBody({ description: 'Array of paired bridges (id and resetPairingInfo) to remove from the cache', type: 'json', isArray: true })
  @Delete('/pairings')
  @HttpCode(204)
  deleteDevicesPairings(@Body() bridges?: { id: string, resetPairingInfo: boolean }[]) {
    return this.serverService.deleteDevicesPairing(bridges)
  }

  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Remove a paired bridge\'s cached accessories.',
  })
  @ApiParam({ name: 'deviceId' })
  @Delete('/pairings/:deviceId/accessories')
  @HttpCode(204)
  deleteDeviceAccessories(@Param('deviceId') deviceId: string) {
    return this.serverService.deleteDeviceAccessories(deviceId)
  }

  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Remove multiple paired bridges\'s cached accessories.',
  })
  @ApiBody({ description: 'Array of bridges (id) for which to remove accessories.', type: 'json', isArray: true })
  @Delete('/pairings/accessories')
  @HttpCode(204)
  deleteDevicesAccessories(@Body() bridges?: { id: string }[]) {
    return this.serverService.deleteDevicesAccessories(bridges)
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Return a random, unused port.' })
  @Get('/port/new')
  lookupUnusedPort() {
    return this.serverService.lookupUnusedPort()
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Return a list of available network interfaces on the server.' })
  @Get('/network-interfaces/system')
  getSystemNetworkInterfaces() {
    return this.serverService.getSystemNetworkInterfaces()
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Return a list of the network interface names assigned to Homebridge.' })
  @Get('/network-interfaces/bridge')
  getHomebridgeNetworkInterfaces() {
    return this.serverService.getHomebridgeNetworkInterfaces()
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Set a list of the network interface names assigned to Homebridge.' })
  @Put('/network-interfaces/bridge')
  setHomebridgeNetworkInterfaces(@Body() body: HomebridgeNetworkInterfacesDto) {
    return this.serverService.setHomebridgeNetworkInterfaces(body.adapters)
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Return the current mDNS advertiser settings.' })
  @Get('/mdns-advertiser')
  getHomebridgeMdnsSetting(): Promise<HomebridgeMdnsSettingDto> {
    return this.serverService.getHomebridgeMdnsSetting()
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Set the mDNS advertiser settings.' })
  @Put('/mdns-advertiser')
  setHomebridgeMdnsSetting(@Body() body: HomebridgeMdnsSettingDto) {
    return this.serverService.setHomebridgeMdnsSetting(body)
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Set the Homebridge name.' })
  @Put('/name')
  setHomebridgeName(@Body() body: { name: string }) {
    return this.serverService.setHomebridgeName(body.name)
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get the Homebridge port.' })
  @Get('/port')
  getHomebridgePort() {
    return this.serverService.getHomebridgePort()
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Set the Homebridge port.' })
  @Put('/port')
  setHomebridgePort(@Body() body: { port: number }) {
    return this.serverService.setHomebridgePort(body.port)
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get the usable ports as set in the config file.' })
  @Get('/ports')
  getUsablePort() {
    return this.serverService.getUsablePorts()
  }

  @UseGuards(AdminGuard)
  @Put('/ports')
  @ApiOperation({ summary: 'Update the usable ports for Homebridge.' })
  @ApiBody({ description: 'Object with start and end properties.', type: 'json', isArray: false })
  setUsablePorts(@Body() body) {
    return this.serverService.setUsablePorts(body)
  }

  @UseGuards(AdminGuard)
  @Post('/wallpaper')
  @ApiOperation({ summary: 'Upload an image file to the Homebridge storage directory and reference this as a wallpaper in the config file.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async uploadWallpaper(@Req() req: FastifyRequest) {
    try {
      const data = await req.file()
      if (data.file.truncated) {
        throw new InternalServerErrorException(`Wallpaper exceeds maximum size ${globalThis.backup.maxBackupSizeText}.`)
      }
      await this.serverService.uploadWallpaper(data)
    } catch (err) {
      this.logger.error(`Wallpaper upload failed as ${err.message}`)
      throw new InternalServerErrorException(err.message)
    }
  }

  @UseGuards(AdminGuard)
  @Post('/ssl/keycert')
  @ApiOperation({ summary: 'Upload a PEM private key and certificate, validate, and save to storage, updating config.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        key: { type: 'string', format: 'binary' },
        cert: { type: 'string', format: 'binary' },
        files: { type: 'string', format: 'binary', description: 'Alternatively, submit both files as multiple parts with field name "files"' },
      },
    },
  })
  async uploadSslKeyCert(@Req() req: FastifyRequest) {
    try {
      return await this.serverService.uploadSslKeyCert(req)
    } catch (err) {
      if (err instanceof HttpException) {
        throw err
      }
      this.logger.error(`SSL key/cert upload failed as ${(err as Error)?.message}`)
      throw new InternalServerErrorException((err as Error)?.message)
    }
  }

  @UseGuards(AdminGuard)
  @Post('/ssl/pfx')
  @ApiOperation({ summary: 'Upload a PKCS#12 (PFX/P12) file with passphrase, validate, and save to storage, updating config.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        pfx: { type: 'string', format: 'binary' },
        passphrase: { type: 'string' },
      },
      required: ['pfx'],
    },
  })
  async uploadSslPfx(@Req() req: FastifyRequest) {
    try {
      return await this.serverService.uploadSslPfx(req)
    } catch (err) {
      if (err instanceof HttpException) {
        throw err
      }
      this.logger.error(`SSL pfx upload failed as ${(err as Error)?.message}`)
      throw new InternalServerErrorException((err as Error)?.message)
    }
  }

  @UseGuards(AdminGuard)
  @Post('/ssl/validate')
  @ApiOperation({ summary: 'Validate the currently configured SSL settings (key+cert or pfx+passphrase).' })
  async validateSsl() {
    try {
      return await this.serverService.validateCurrentSslConfig()
    } catch (err) {
      if (err instanceof HttpException) {
        throw err
      }
      this.logger.error(`SSL validate failed as ${(err as Error)?.message}`)
      throw new InternalServerErrorException((err as Error)?.message)
    }
  }

  @UseGuards(AdminGuard)
  @Post('/ssl/selfsigned/generate')
  @ApiOperation({ summary: 'Generate a self-signed certificate and optionally set it as active key/cert in config.' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        hostnames: { type: 'array', items: { type: 'string' } },
        mode: { type: 'string', enum: ['selfsigned', 'keycert'], default: 'keycert' },
      },
    },
  })
  async generateSelfSigned(@Body() body: { hostnames?: string[], mode?: 'selfsigned' | 'keycert' }) {
    try {
      return await this.serverService.generateSelfSignedCertificate(body)
    } catch (err) {
      if (err instanceof HttpException) {
        throw err
      }
      this.logger.error(`Generate self-signed certificate failed as ${(err as Error)?.message}`)
      throw new InternalServerErrorException((err as Error)?.message)
    }
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Delete the current wallpaper file and remove the reference from the config file.' })
  @Delete('/wallpaper')
  @HttpCode(204)
  async deleteWallpaper(): Promise<void> {
    await this.serverService.deleteWallpaper()
  }
}
