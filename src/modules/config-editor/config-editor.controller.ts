import { Controller, UseGuards, Get, Post, Body, Param, Delete } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ConfigEditorService } from './config-editor.service';
import { AdminGuard } from '../../core/auth/guards/admin.guard';

@ApiTags('Homebridge Config Editor')
@ApiBearerAuth()
@UseGuards(AuthGuard())
@Controller('config-editor')
export class ConfigEditorController {
  constructor(
    private configEditorService: ConfigEditorService,
  ) { }

  @UseGuards(AdminGuard)
  @Get()
  getConfig() {
    return this.configEditorService.getConfigFile();
  }

  @UseGuards(AdminGuard)
  @Post()
  updateConfig(@Body() body) {
    return this.configEditorService.updateConfigFile(body);
  }

  @UseGuards(AdminGuard)
  @Get('/backups')
  listConfigBackups() {
    return this.configEditorService.listConfigBackups();
  }

  @UseGuards(AdminGuard)
  @Get('/backups/:backupId(\\d+)')
  getBackup(@Param() param) {
    return this.configEditorService.getConfigBackup(param.backupId);
  }

  @UseGuards(AdminGuard)
  @Delete('/backups')
  deleteAllConfigBackups() {
    return this.configEditorService.deleteAllConfigBackups();
  }
}
