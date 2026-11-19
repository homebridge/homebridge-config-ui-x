import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'

import { AdminGuard } from '../../core/auth/guards/admin.guard.js'
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard.js'
import { KioskDeviceGuard } from './kiosk-device.guard.js'
import { KioskDeviceCreateDto, KioskDeviceUpdateDto, KioskPairDto } from './kiosk.dto.js'
import { KioskService } from './kiosk.service.js'

@ApiTags('Kiosk')
@Controller('kiosk')
export class KioskController {
  constructor(
    @Inject(KioskService) private readonly kioskService: KioskService,
  ) {}

  @ApiOperation({ summary: 'List paired kiosk devices.' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('/devices')
  listDevices() {
    return this.kioskService.listDevices()
  }

  @ApiOperation({ summary: 'Create a kiosk device.' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('/devices')
  createDevice(@Request() req, @Body() body: KioskDeviceCreateDto) {
    return this.kioskService.createDevice(req.user.username, body)
  }

  @ApiOperation({ summary: 'Update a kiosk device.' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch('/devices/:id')
  updateDevice(@Param('id') id: string, @Body() body: KioskDeviceUpdateDto) {
    return this.kioskService.updateDevice(id, body)
  }

  @ApiOperation({ summary: 'Delete a kiosk device and disconnect it immediately.' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Delete('/devices/:id')
  deleteDevice(@Param('id') id: string) {
    return this.kioskService.deleteDevice(id)
  }

  @ApiOperation({ summary: 'Issue a single-use pairing code (valid for 10 minutes) for a kiosk device.' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('/devices/:id/pairing-code')
  createPairingCode(@Param('id') id: string) {
    return this.kioskService.createPairingCode(id)
  }

  @ApiOperation({ summary: 'Exchange a pairing code for a device token.' })
  @HttpCode(200)
  @Post('/pair')
  pair(@Request() req, @Body() body: KioskPairDto) {
    return this.kioskService.pair(body?.code, req.ip)
  }

  @ApiOperation({ summary: 'The device\'s rooms and accessories. Authenticated with `Authorization: Kiosk <token>`.' })
  @UseGuards(KioskDeviceGuard)
  @Get('/session')
  session(@Request() req) {
    return this.kioskService.buildSession(req.kioskDevice)
  }
}
