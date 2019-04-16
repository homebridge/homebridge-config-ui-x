import { Controller, Post, Body, Get } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthDto } from './auth.dto';
import { ConfigService } from '../config/config.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) { }

  @Post('login')
  signIn(@Body() body: AuthDto) {
    return this.authService.signIn(body.username, body.password);
  }

  @Get('/settings')
  getSettings() {
    return this.configService.uiSettings();
  }

  @Post('/noauth')
  getToken() {
    return this.authService.generateNoAuthToken();
  }

}
