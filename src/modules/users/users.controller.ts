import { Controller, UseGuards, Body, Post, Get, Param, Delete, Patch } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from '../../core/auth/auth.service';
import { AdminGuard } from '../../core/auth/guards/admin.guard';

@UseGuards(AuthGuard())
@Controller('users')
export class UsersController {

  constructor(
    private authService: AuthService,
  ) { }

  @UseGuards(AdminGuard)
  @Get()
  getUsers() {
    return this.authService.getUsers();
  }

  @UseGuards(AdminGuard)
  @Post()
  addUser(@Body() body) {
    return this.authService.addUser(body);
  }

  @UseGuards(AdminGuard)
  @Patch('/:userId(\\d+)')
  updateUser(@Param() param, @Body() body) {
    return this.authService.updateUser(param.userId, body);
  }

  @UseGuards(AdminGuard)
  @Delete('/:userId(\\d+)')
  deleteUser(@Param() param) {
    return this.authService.deleteUser(param.userId);
  }
}
