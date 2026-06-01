import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger'

import { AccessorySetCharacteristicDto, SmartLightGroupAutomationDto } from './accessories.dto.js'
import { AccessoriesService } from './accessories.service.js'

@ApiTags('Accessories')
@ApiBearerAuth()
@UseGuards(AuthGuard())
@Controller('accessories')
export class AccessoriesController {
  constructor(
    @Inject(AccessoriesService) private readonly accessoriesService: AccessoriesService,
  ) {}

  @ApiOperation({
    summary: 'Return a list of Homebridge accessories.',
    description: 'Homebridge must be running in `insecure` mode to access the accessory list.',
  })
  @Get('/')
  getAccessories() {
    return this.accessoriesService.loadAccessories()
  }

  @ApiOperation({
    summary: 'Get the accessory and room layout for the authenticating user.',
  })
  @Get('/layout')
  getAccessoryLayout(@Request() req) {
    return this.accessoriesService.getAccessoryLayout(req.user.username)
  }

  @ApiOperation({
    summary: 'Run smart light group automation and restore previous light state.',
    description: 'Turns selected light services on and restores their previous writable state after a delay.',
  })
  @Put('/automation/smart-light-group')
  runSmartLightGroupAutomation(@Body() body: SmartLightGroupAutomationDto) {
    return this.accessoriesService.runSmartLightGroupAutomation(body.uniqueIds, body.restoreAfterMs)
  }

  @ApiOperation({
    summary: 'Get a single accessory and refresh its characteristics.',
    description: 'Get the `uniqueId` from `GET /api/accessories`.',
  })
  @Get('/:uniqueId')
  getAccessory(@Param('uniqueId') uniqueId: string) {
    return this.accessoriesService.getAccessory(uniqueId)
  }

  @ApiOperation({
    summary: 'Set the value of an accessory characteristic.',
    description: 'Get the `uniqueId` and `characteristicType` values from `GET /api/accessories`.',
  })
  @ApiParam({ name: 'uniqueId' })
  @Put('/:uniqueId')
  setAccessoryCharacteristic(@Param('uniqueId') uniqueId, @Body() body: AccessorySetCharacteristicDto) {
    return this.accessoriesService.setAccessoryCharacteristic(uniqueId, body.characteristicType, body.value)
  }
}
