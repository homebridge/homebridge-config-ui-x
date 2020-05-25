import { Controller, Post, Body, Get, UseGuards, Header } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiExcludeEndpoint, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { AuthDto } from './auth.dto';
import { ConfigService } from '../config/config.service';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) { }

  @ApiOperation({ description: 'Exchange a username and password for an authentication token.' })
  @Post('login')
  signIn(@Body() body: AuthDto) {
    return this.authService.signIn(body.username, body.password, body.otp);
  }

  @Get('/settings')
  @ApiOperation({ description: 'Return settings required to load the UI before authentication.' })
  getSettings() {
    return this.configService.uiSettings();
  }

  @ApiExcludeEndpoint()
  @Get('/wallpaper/:hash')
  @Header('Content-Type', 'image/jpeg')
  @Header('Cache-Control', 'public,max-age=31536000,immutable')
  getCustomWallpaper() {
    return this.configService.streamCustomWallpaper();
  }

  @ApiOperation({ description: 'This method can be used to obtain an access token ONLY when authentication has been disabled.' })
  @Post('/noauth')
  getToken() {
    return this.authService.generateNoAuthToken();
  }

  @ApiBearerAuth()
  @ApiOperation({ description: 'Check to see if an authentication token is still valid.' })
  @UseGuards(AuthGuard())
  @Get('/check')
  checkAuth() {
    return { status: 'OK' };
  }

}
