import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger'

import { AdminGuard } from '../../core/auth/guards/admin.guard'
import { ConfigEditorService } from './config-editor.service'

@ApiTags('Homebridge Config Editor')
@ApiBearerAuth()
@UseGuards(AuthGuard())
@Controller('config-editor')
export class ConfigEditorController {
  constructor(
    private configEditorService: ConfigEditorService,
  ) {}

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Return the current Homebridge `config.json` file.' })
  @Get()
  getConfig() {
    return this.configEditorService.getConfigFile()
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Update the Homebridge `config.json` file.' })
  @ApiBody({ description: 'Homebridge config.json', type: 'json', isArray: false })
  @Post()
  updateConfig(@Body() body) {
    return this.configEditorService.updateConfigFile(body)
  }

  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Return the config blocks for a specific plugin.',
    description: 'An array of config blocks will be returned. An empty array will be returned if the plugin is not configured.',
  })
  @Get('/plugin/:pluginName')
  getConfigForPlugin(@Param('pluginName') pluginName: string) {
    return this.configEditorService.getConfigForPlugin(pluginName)
  }

  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Replace the config for a specific plugin.',
    description: 'An array of all config blocks for the plugin must be provided, missing blocks will be removed. Sending an empty array will remove all plugin config.',
  })
  @Post('/plugin/:pluginName')
  @ApiBody({ description: 'Array of plugin config blocks', type: 'json', isArray: true })
  updateConfigForPlugin(@Param('pluginName') pluginName: string, @Body() body) {
    return this.configEditorService.updateConfigForPlugin(pluginName, body)
  }

  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Mark a plugin as disabled.',
  })
  @ApiParam({ name: 'pluginName', type: 'string' })
  @Put('plugin/:pluginName/disable')
  disablePlugin(@Param('pluginName') pluginName) {
    return this.configEditorService.disablePlugin(pluginName)
  }

  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Mark a plugin as enabled.',
  })
  @ApiParam({ name: 'pluginName', type: 'string' })
  @Put('plugin/:pluginName/enable')
  enablePlugin(@Param('pluginName') pluginName) {
    return this.configEditorService.enablePlugin(pluginName)
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Update a config property for the Homebridge UI.' })
  @Put('/ui')
  setPropertyForUi(@Body() { key, value }) {
    return this.configEditorService.setPropertyForUi(key, value)
  }

  @UseGuards(AdminGuard)
  @Put('/ui/accessory-control/instance-blacklist')
  @ApiOperation({ summary: 'Update the accessory control instance blacklist.' })
  @ApiBody({ description: 'Array of bridge instances for which control by the UI should be blocked.', type: 'json', isArray: true })
  @Put()
  setAccessoryControlInstanceBlacklist(@Body() { body }) {
    return this.configEditorService.setAccessoryControlInstanceBlacklist(body)
  }

  @UseGuards(AdminGuard)
  @Put('/ui/plugins/hide-updates-for')
  @ApiOperation({ summary: 'Update the plugins hide updates for.' })
  @ApiBody({ description: 'Array of plugin names to hide updates for in the UI.', type: 'json', isArray: true })
  @Put()
  setPluginsHideUpdatesFor(@Body() { body }) {
    return this.configEditorService.setPluginsHideUpdatesFor(body)
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'List the available Homebridge `config.json` backups.' })
  @Get('/backups')
  listConfigBackups() {
    return this.configEditorService.listConfigBackups()
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Return the Homebridge `config.json` file for the given backup ID.' })
  @ApiParam({ name: 'backupId', type: 'number' })
  @Get('/backups/:backupId')
  getBackup(@Param('backupId', ParseIntPipe) backupId) {
    return this.configEditorService.getConfigBackup(backupId)
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Delete the backup file for the given backup ID.' })
  @ApiParam({ name: 'backupId', type: 'number' })
  @Delete('/backups/:backupId')
  deleteBackup(@Param('backupId', ParseIntPipe) backupId) {
    return this.configEditorService.deleteConfigBackup(backupId)
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Delete all the Homebridge `config.json` backups.' })
  @Delete('/backups')
  deleteAllConfigBackups() {
    return this.configEditorService.deleteAllConfigBackups()
  }
}
