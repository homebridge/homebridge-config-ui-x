import { Controller, UseGuards, Get, Put, Param, Body, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { AccessoriesService } from './accessories.service';
import { AccessorySetCharacteristicDto } from './accessories.dto';

@ApiTags('Accessories')
@ApiBearerAuth()
@UseGuards(AuthGuard())
@Controller('accessories')
export class AccessoriesController {
  constructor(
    private readonly accessoriesService: AccessoriesService,
  ) { }

  @ApiOperation({
    summary: 'Return a list of Homebridge accessories.',
    description: 'Homebridge must be running in "insecure" mode to access the accessory list.',
  })
  @Get('/')
  getAccessories() {
    return this.accessoriesService.loadAccessories();
  }

  @ApiOperation({
    summary: 'Get the accessory and room layout for the authenticating user.',
  })
  @Get('/layout')
  getAccessoryLayout(@Req() req) {
    return this.accessoriesService.getAccessoryLayout(req.user.username);
  }

  @ApiOperation({
    summary: 'Get a single accessory and refresh it\'s characteristics.',
    description: 'Get the "uniqueId" from the GET /api/accessories method.',
  })
  @Get('/:uniqueId')
  getAccessory(@Param('uniqueId') uniqueId: string) {
    return this.accessoriesService.getAccessory(uniqueId);
  }

  @ApiOperation({
    summary: 'Set the value of an accessory characteristic.',
    description: 'Get the "uniqueId" and "characteristicType" values from the GET /api/accessories method.',
  })
  @ApiParam({ name: 'uniqueId' })
  @Put('/:uniqueId')
  setAccessoryCharacteristic(@Param('uniqueId') uniqueId, @Body() body: AccessorySetCharacteristicDto) {
    return this.accessoriesService.setAccessoryCharacteristic(uniqueId, body.characteristicType, body.value);
  }

}
