import { Controller, UseGuards, Get, Req, Post, Body } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AccessoriesService } from './accessories.service';

@UseGuards(AuthGuard())
@Controller('accessories')
export class AccessoriesController {
  constructor(
    private accessoriesService: AccessoriesService,
  ) { }

  @Get()
  getAccessoryLayout(@Req() req) {
    return this.accessoriesService.getAccessoryLayout(req.user.username);
  }

  @Post()
  saveAccessoryLayout(@Req() req, @Body() body) {
    return this.accessoriesService.saveAccessoryLayout(req.user.username, body);
  }
}
