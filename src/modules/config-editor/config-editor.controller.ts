import { Controller, UseGuards, Get, Post, Body, Param, Delete, ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiBody, ApiParam } from '@nestjs/swagger';
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
  @ApiOperation({ summary: 'Return the current Homebridge config.json file.' })
  @Get()
  getConfig() {
    return this.configEditorService.getConfigFile();
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Update the Homebridge config.json file.' })
  @ApiBody({ description: 'Homebridge config.json', type: 'json', isArray: false })
  @Post()
  updateConfig(@Body() body) {
    return this.configEditorService.updateConfigFile(body);
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'List the available Homebridge config.json backups.' })
  @Get('/backups')
  listConfigBackups() {
    return this.configEditorService.listConfigBackups();
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Return the Homebridge config.json file for the given backup ID.' })
  @ApiParam({ name: 'backupId', type: 'number' })
  @Get('/backups/:backupId(\\d+)')
  getBackup(@Param('backupId', ParseIntPipe) backupId) {
    return this.configEditorService.getConfigBackup(backupId);
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Delete all the Homebridge config.json backups.' })
  @Delete('/backups')
  deleteAllConfigBackups() {
    return this.configEditorService.deleteAllConfigBackups();
  }
}
