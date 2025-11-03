import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import { AuthService } from '../../core/auth/auth.service.js'
import { UserDto } from '../users/users.dto.js'
import { SetupWizardGuard } from './setup-wizard.guard.js'

@ApiTags('Setup Wizard')
@UseGuards(SetupWizardGuard)
@Controller('setup-wizard')
export class SetupWizardController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  @Post('/create-first-user')
  @ApiOperation({
    summary: 'Create the first user.',
    description: 'This endpoint is not available after the Homebridge setup wizard is complete.',
  })
  async setupFirstUser(@Body() body: UserDto) {
    return await this.authService.setupFirstUser(body)
  }

  @Get('/get-setup-wizard-token')
  @ApiOperation({
    summary: 'Creates a auth token to be used by the setup wizard.',
    description: 'This endpoint is not available after the Homebridge setup wizard is complete.',
  })
  async generateSetupWizardToken() {
    return await this.authService.generateSetupWizardToken()
  }
}
