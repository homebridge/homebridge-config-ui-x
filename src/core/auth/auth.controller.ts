import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger'

import { ConfigService } from '../config/config.service'
import { AuthDto } from './auth.dto'
import { AuthService } from './auth.service'

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @ApiOperation({ summary: 'Exchange a username and password for an authentication token.' })
  @Post('login')
  signIn(@Body() body: AuthDto) {
    return this.authService.signIn(body.username, body.password, body.otp)
  }

  @Get('/settings')
  @ApiOperation({ summary: 'Return settings required to load the UI before authentication.' })
  getSettings() {
    return this.configService.uiSettings()
  }

  @ApiExcludeEndpoint()
  @Get('/wallpaper/:hash')
  @Header('Content-Type', 'image/jpeg')
  @Header('Cache-Control', 'public,max-age=31536000,immutable')
  getCustomWallpaper() {
    return this.configService.streamCustomWallpaper()
  }

  @ApiOperation({ summary: 'This method can be used to obtain an access token ONLY when authentication has been disabled.' })
  @Post('/noauth')
  getToken() {
    return this.authService.generateNoAuthToken()
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check to see if an authentication token is still valid.' })
  @UseGuards(AuthGuard())
  @Get('/check')
  checkAuth() {
    return { status: 'OK' }
  }
}
