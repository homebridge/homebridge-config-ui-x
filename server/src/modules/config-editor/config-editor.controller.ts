import { Controller, UseGuards, Get, Post, Body, Param, Delete } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigEditorService } from './config-editor.service';

@UseGuards(AuthGuard())
@Controller('config-editor')
export class ConfigEditorController {
  constructor(
    private configEditorService: ConfigEditorService,
  ) { }

  @Get()
  getConfig() {
    return this.configEditorService.getConfigFile();
  }

  @Post()
  updateConfig(@Body() body) {
    return this.configEditorService.updateConfigFile(body);
  }

  @Get('/backups')
  listConfigBackups() {
    return this.configEditorService.listConfigBackups();
  }

  @Get('/backups/:backupId(\\d+)')
  getBackup(@Param() param) {
    return this.configEditorService.getConfigBackup(param.backupId);
  }

  @Delete('/backups')
  deleteAllConfigBackups() {
    return this.configEditorService.deleteAllConfigBackups();
  }
}
