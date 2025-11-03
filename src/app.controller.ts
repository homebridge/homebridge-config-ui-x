import { Controller, Get, Inject } from '@nestjs/common'
import { ApiExcludeEndpoint } from '@nestjs/swagger'

import { AppService } from './app.service.js'

@Controller()
export class AppController {
  constructor(@Inject(AppService) private readonly appService: AppService) {}

  @ApiExcludeEndpoint()
  @Get()
  getHello(): string {
    return this.appService.getHello()
  }
}
