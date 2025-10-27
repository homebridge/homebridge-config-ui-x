import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'

import { AuthService } from '../../core/auth/auth.service'
import { AdminGuard } from '../../core/auth/guards/admin.guard'
import { JwtOrApiTokenGuard } from '../../core/auth/guards/jwt-or-api-token.guard'
import { CreateApiTokenDto, UserActivateOtpDto, UserDeactivateOtpDto, UserDto, UserUpdatePasswordDto } from './users.dto'

@ApiTags('User Management')
@ApiBearerAuth()
@UseGuards(JwtOrApiTokenGuard)
@Controller('users')
export class UsersController {
  constructor(
    private authService: AuthService,
  ) {}

  @UseGuards(AdminGuard)
  @ApiResponse({ type: UserDto, isArray: true, status: 200 })
  @ApiOperation({ summary: 'Get a list of existing users.' })
  @Get()
  getUsers() {
    return this.authService.getUsers(true)
  }

  @UseGuards(AdminGuard)
  @ApiResponse({ type: UserDto, status: 201 })
  @ApiOperation({ summary: 'Create a new user.' })
  @Post()
  addUser(@Body() body: UserDto) {
    return this.authService.addUser(body)
  }

  @UseGuards(AdminGuard)
  @ApiResponse({ type: UserDto, status: 200 })
  @ApiOperation({ summary: 'Update a user.' })
  @ApiParam({ name: 'userId', type: 'number' })
  @Patch('/:userId')
  updateUser(@Param('userId', ParseIntPipe) userId: number, @Body() body: UserDto) {
    return this.authService.updateUser(userId, body)
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Delete a user.' })
  @ApiParam({ name: 'userId', type: 'number' })
  @Delete('/:userId')
  deleteUser(@Param('userId', ParseIntPipe) userId: number) {
    return this.authService.deleteUser(userId)
  }

  @ApiOperation({ summary: 'Update the password for the current user.' })
  @ApiBody({ type: UserUpdatePasswordDto })
  @Post('/change-password')
  updateOwnPassword(@Request() req, @Body() body: UserUpdatePasswordDto) {
    return this.authService.updateOwnPassword(req.user.username, body.currentPassword, body.newPassword)
  }

  @ApiOperation({ summary: 'Start 2FA setup for the current user.' })
  @Post('/otp/setup')
  setupOtp(@Request() req) {
    return this.authService.setupOtp(req.user.username)
  }

  @ApiOperation({ summary: 'Activate 2FA setup for the current user.' })
  @ApiBody({ type: UserActivateOtpDto })
  @Post('/otp/activate')
  activateOtp(@Request() req, @Body() body: UserActivateOtpDto) {
    return this.authService.activateOtp(req.user.username, body.code)
  }

  @ApiOperation({ summary: 'Deactivate 2FA setup for the current user.' })
  @ApiBody({ type: UserDeactivateOtpDto })
  @Post('/otp/deactivate')
  deactivateOtp(@Request() req, @Body() body: UserDeactivateOtpDto) {
    return this.authService.deactivateOtp(req.user.username, body.password)
  }

  @ApiOperation({ summary: 'Get all API tokens for the current user.' })
  @Get('/api-tokens')
  getApiTokens(@Request() req) {
    return this.authService.getApiTokens(req.user.username)
  }

  @ApiOperation({ summary: 'Create a new API token for the current user.' })
  @ApiBody({ type: CreateApiTokenDto })
  @Post('/api-tokens')
  createApiToken(@Request() req, @Body() body: CreateApiTokenDto) {
    return this.authService.createApiToken(req.user.username, body.name)
  }

  @ApiOperation({ summary: 'Delete an API token for the current user.' })
  @ApiParam({ name: 'tokenId', type: 'string' })
  @Delete('/api-tokens/:tokenId')
  deleteApiToken(@Request() req, @Param('tokenId') tokenId: string) {
    return this.authService.deleteApiToken(req.user.username, tokenId)
  }
}
