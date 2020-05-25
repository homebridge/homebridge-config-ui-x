import { Controller, UseGuards, Body, Post, Get, Param, Delete, Patch, ParseIntPipe, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiBody, ApiResponse, ApiOperation } from '@nestjs/swagger';
import { AuthService } from '../../core/auth/auth.service';
import { AdminGuard } from '../../core/auth/guards/admin.guard';
import { UserDto, UserUpdatePasswordDto, UserActivateOtpDto, UserDeactivateOtpDto } from './users.dto';

@ApiTags('User Management')
@ApiBearerAuth()
@UseGuards(AuthGuard())
@Controller('users')
export class UsersController {

  constructor(
    private authService: AuthService,
  ) { }

  @ApiResponse({ type: UserDto, isArray: true, status: 200 })
  @UseGuards(AdminGuard)
  @Get()
  getUsers() {
    return this.authService.getUsers(true);
  }

  @ApiResponse({ type: UserDto, status: 201 })
  @UseGuards(AdminGuard)
  @Post()
  addUser(@Body() body: UserDto) {
    return this.authService.addUser(body);
  }

  @ApiResponse({ type: UserDto, status: 200 })
  @UseGuards(AdminGuard)
  @Patch('/:userId(\\d+)')
  updateUser(@Param('userId', ParseIntPipe) userId: number, @Body() body: UserDto) {
    return this.authService.updateUser(userId, body);
  }

  @UseGuards(AdminGuard)
  @Delete('/:userId(\\d+)')
  deleteUser(@Param('userId', ParseIntPipe) userId: number) {
    return this.authService.deleteUser(userId);
  }

  @ApiOperation({ description: 'Update the password for the current user.' })
  @ApiBody({ type: UserUpdatePasswordDto })
  @Post('/change-password')
  updateOwnPassword(@Req() req, @Body() body: UserUpdatePasswordDto) {
    return this.authService.updateOwnPassword(req.user.username, body.currentPassword, body.newPassword);
  }

  @ApiOperation({ description: 'Start 2FA setup for the current user.' })
  @Post('/otp/setup')
  setupOtp(@Req() req) {
    return this.authService.setupOtp(req.user.username);
  }

  @ApiOperation({ description: 'Activate 2FA setup for the current user.' })
  @ApiBody({ type: UserActivateOtpDto })
  @Post('/otp/activate')
  activateOtp(@Req() req, @Body() body: UserActivateOtpDto) {
    return this.authService.activateOtp(req.user.username, body.code);
  }

  @ApiOperation({ description: 'Deactivate 2FA setup for the current user.' })
  @ApiBody({ type: UserDeactivateOtpDto })
  @Post('/otp/deactivate')
  deactivateOtp(@Req() req, @Body() body: UserDeactivateOtpDto) {
    return this.authService.deactivateOtp(req.user.username, body.password);
  }
}
