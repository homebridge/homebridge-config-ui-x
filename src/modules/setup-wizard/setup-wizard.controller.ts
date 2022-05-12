import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { UserDto } from '../users/users.dto';
import { AuthService } from '../../core/auth/auth.service';
import { SetupWizardGuard } from './setup-wizard.guard';

@ApiTags('Setup Wizard')
@UseGuards(SetupWizardGuard)
@Controller('setup-wizard')
export class SetupWizardController {
  constructor(
    private authService: AuthService,
  ) { }

  @Post('/create-first-user')
  async createFirstUser(@Body() body: UserDto) {
    return await this.authService.setupFirstUser(body);
  }

}
