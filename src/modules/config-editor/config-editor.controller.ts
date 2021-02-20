import { Controller, UseGuards, Get, Post, Body, Param, Delete, ParseIntPipe, Put } from '@nestjs/common';
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
  @ApiOperation({
    summary: 'Return the config blocks for a specific plugin.',
    description: 'An array of config blocks will be returned. An empty array will be returned if the plugin is not configured.',
  })
  @Get('/plugin/:pluginName')
  getConfigForPlugin(@Param('pluginName') pluginName: string) {
    return this.configEditorService.getConfigForPlugin(pluginName);
  }

  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Replace the config for a specific plugin.',
    description: 'An array of all config blocks for the plugin must be provided, missing blocks will be removed. Sending an empty array will remove all plugin config.',
  })
  @Post('/plugin/:pluginName')
  @ApiBody({ description: 'Array of plugin config blocks', type: 'json', isArray: true })
  updateConfigForPlugin(@Param('pluginName') pluginName: string, @Body() body) {
    return this.configEditorService.updateConfigForPlugin(pluginName, body);
  }

  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Mark the plugin as disabled.',
  })
  @ApiParam({ name: 'pluginName', type: 'string' })
  @Put('plugin/:pluginName/disable')
  disablePlugin(@Param('pluginName') pluginName) {
    return this.configEditorService.disablePlugin(pluginName);
  }

  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Mark the plugin as enabled.',
  })
  @ApiParam({ name: 'pluginName', type: 'string' })
  @Put('plugin/:pluginName/enable')
  enablePlugin(@Param('pluginName') pluginName) {
    return this.configEditorService.enablePlugin(pluginName);
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
