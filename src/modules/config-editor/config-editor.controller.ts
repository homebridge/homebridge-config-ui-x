import type { HomebridgeUiBridgeConfig } from '../../core/config/config.interfaces.js'

import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger'

import { AdminGuard } from '../../core/auth/guards/admin.guard.js'
import { PortRangeDto, SetBridgeAlertDto, SetScheduledRestartCronDto } from './config-editor.dto.js'
import { ConfigEditorService } from './config-editor.service.js'

function includesRestartInfo(include: string | undefined): boolean {
  return (include ?? '').split(',').map(s => s.trim()).includes('restart-info')
}

@ApiTags('Homebridge Config Editor')
@ApiBearerAuth()
@UseGuards(AuthGuard())
@Controller('config-editor')
export class ConfigEditorController {
  constructor(
    @Inject(ConfigEditorService) private readonly configEditorService: ConfigEditorService,
  ) {}

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Return the current Homebridge `config.json` file.' })
  @Get()
  getConfig() {
    return this.configEditorService.getConfigFile()
  }

  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Update the Homebridge `config.json` file.',
    description: 'Pass `?include=restart-info` to receive `{ config, affectedBridges }` instead of the bare config — used by the editor to skip the follow-up `/status/homebridge/child-bridges` fetch after every save. Default response shape is unchanged.',
  })
  @ApiBody({ description: 'Homebridge config.json', type: 'json', isArray: false })
  @ApiQuery({
    name: 'include',
    type: 'string',
    required: false,
    description: 'Comma-separated extras. Supported: `restart-info`.',
    example: 'restart-info',
  })
  @Post()
  updateConfig(@Body() body, @Query('include') include?: string) {
    if (includesRestartInfo(include)) {
      return this.configEditorService.updateConfigFileWithRestartInfo(body)
    }
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
    description: 'An array of all config blocks for the plugin must be provided, missing blocks will be removed. Sending an empty array will remove all plugin config. Pass `?include=restart-info` to receive `{ config, affectedBridges }` with only this plugin\'s bridges in `affectedBridges` — the plugin settings modals use this to skip the follow-up `/status/homebridge/child-bridges` fetch.',
  })
  @Post('/plugin/:pluginName')
  @ApiBody({ description: 'Array of plugin config blocks', type: 'json', isArray: true })
  @ApiQuery({
    name: 'include',
    type: 'string',
    required: false,
    description: 'Comma-separated extras. Supported: `restart-info`.',
    example: 'restart-info',
  })
  updateConfigForPlugin(@Param('pluginName') pluginName: string, @Body() body, @Query('include') include?: string) {
    if (includesRestartInfo(include)) {
      return this.configEditorService.updateConfigForPluginWithRestartInfo(pluginName, body)
    }
    return this.configEditorService.updateConfigForPlugin(pluginName, body)
  }

  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Mark a plugin as disabled.',
    description: 'Pass `?include=restart-info` to receive `{ config, affectedBridges }` where `config` is the updated `disabledPlugins` array. Default response shape is unchanged.',
  })
  @ApiParam({ name: 'pluginName', type: 'string' })
  @ApiQuery({
    name: 'include',
    type: 'string',
    required: false,
    description: 'Comma-separated extras. Supported: `restart-info`.',
    example: 'restart-info',
  })
  @Put('plugin/:pluginName/disable')
  disablePlugin(@Param('pluginName') pluginName, @Query('include') include?: string) {
    if (includesRestartInfo(include)) {
      return this.configEditorService.disablePluginWithRestartInfo(pluginName)
    }
    return this.configEditorService.disablePlugin(pluginName)
  }

  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Mark a plugin as enabled.',
    description: 'Pass `?include=restart-info` to receive `{ config, affectedBridges }` where `config` is the updated `disabledPlugins` array. Default response shape is unchanged.',
  })
  @ApiParam({ name: 'pluginName', type: 'string' })
  @ApiQuery({
    name: 'include',
    type: 'string',
    required: false,
    description: 'Comma-separated extras. Supported: `restart-info`.',
    example: 'restart-info',
  })
  @Put('plugin/:pluginName/enable')
  enablePlugin(@Param('pluginName') pluginName, @Query('include') include?: string) {
    if (includesRestartInfo(include)) {
      return this.configEditorService.enablePluginWithRestartInfo(pluginName)
    }
    return this.configEditorService.enablePlugin(pluginName)
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get a config property for the Homebridge UI.' })
  @ApiParam({ name: 'key', type: 'string', description: 'The property key to retrieve (e.g., "nodeUpdatePolicy")' })
  @Get('/ui/:key')
  getPropertyForUi(@Param('key') key: string) {
    return this.configEditorService.getPropertyForUi(key)
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Update a config property for the Homebridge UI.' })
  @Put('/ui')
  setPropertyForUi(@Body() { key, value }) {
    return this.configEditorService.setPropertyForUi(key, value)
  }

  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Update multiple Homebridge UI config properties in a single disk write.',
    description: 'Body is a `{ key: value }` map. Keys support dot notation for nested properties (e.g. `terminal.fontSize`). The settings page batches concurrent field edits through this endpoint so a burst of changes is one PATCH instead of one PUT per field.',
  })
  @ApiBody({
    description: 'Map of UI config property keys to their new values.',
    schema: {
      type: 'object',
      additionalProperties: true,
      example: { 'theme': 'red', 'lang': 'auto', 'terminal.fontSize': 14 },
    },
  })
  @Patch('/ui')
  patchPropertiesForUi(@Body() body: Record<string, any>) {
    return this.configEditorService.setPropertiesForUi(body)
  }

  @UseGuards(AdminGuard)
  @Put('/ui/accessory-control/instance-blacklist')
  @ApiOperation({ summary: 'Update the accessory control instance blacklist.' })
  @ApiBody({ description: 'Array of bridge instances for which control by the UI should be blocked.', type: 'json', isArray: true })
  setAccessoryControlInstanceBlacklist(@Body() { body }) {
    return this.configEditorService.setAccessoryControlInstanceBlacklist(body)
  }

  @UseGuards(AdminGuard)
  @Get('/ui/plugins/hide-updates-for')
  @ApiOperation({ summary: 'Get the plugins hide updates for list.' })
  getPluginsHideUpdatesFor(): Promise<string[]> {
    return this.configEditorService.getPluginsHideUpdatesFor()
  }

  @UseGuards(AdminGuard)
  @Put('/ui/plugins/hide-updates-for')
  @ApiOperation({ summary: 'Update the plugins hide updates for.' })
  @ApiBody({ description: 'Array of plugin names to hide updates for in the UI.', type: 'json', isArray: true })
  setPluginsHideUpdatesFor(@Body() { body }) {
    return this.configEditorService.setPluginsHideUpdatesFor(body)
  }

  @UseGuards(AdminGuard)
  @Get('/ui/plugins/hide-child-bridge-setup-for')
  @ApiOperation({ summary: 'Get the plugins hide child-bridge-setup recommendation list.' })
  getPluginsHideChildBridgeSetupFor(): Promise<string[]> {
    return this.configEditorService.getPluginsHideChildBridgeSetupFor()
  }

  @UseGuards(AdminGuard)
  @Put('/ui/plugins/hide-child-bridge-setup-for')
  @ApiOperation({ summary: 'Update the plugins hide child-bridge-setup recommendation list.' })
  @ApiBody({ description: 'Array of plugin names for which the set-up child bridge recommendation should be hidden.', type: 'json', isArray: true })
  setPluginsHideChildBridgeSetupFor(@Body() { body }) {
    return this.configEditorService.setPluginsHideChildBridgeSetupFor(body)
  }

  @UseGuards(AdminGuard)
  @Get('/ui/bridges/:username')
  @ApiOperation({ summary: 'Get a specific bridge configuration by username.' })
  @ApiParam({
    name: 'username',
    type: String,
    description: 'The MAC address of the bridge (e.g., "0E:02:9A:9D:44:45")',
    example: '0E:02:9A:9D:44:45',
  })
  @ApiOkResponse({
    description: 'Bridge configuration',
    type: 'object',
    schema: {
      example: {
        username: '0E:02:9A:9D:44:45',
        hideHapAlert: true,
        hideMatterAlert: false,
      },
    },
  })
  getBridge(@Param('username') username: string): Promise<HomebridgeUiBridgeConfig | null> {
    return this.configEditorService.getBridge(username)
  }

  @UseGuards(AdminGuard)
  @Put('/ui/bridges/:username/hide-hap-alert')
  @ApiOperation({ summary: 'Set the hideHapAlert flag for a specific bridge.' })
  @ApiParam({
    name: 'username',
    type: String,
    description: 'The MAC address of the bridge (e.g., "0E:02:9A:9D:44:45")',
    example: '0E:02:9A:9D:44:45',
  })
  @ApiBody({ type: SetBridgeAlertDto })
  setBridgeHideHapAlert(@Param('username') username: string, @Body() body: SetBridgeAlertDto) {
    return this.configEditorService.setBridgeHideHapAlert(username, body.value)
  }

  @UseGuards(AdminGuard)
  @Put('/ui/bridges/:username/hide-matter-alert')
  @ApiOperation({ summary: 'Set the hideMatterAlert flag for a specific bridge.' })
  @ApiParam({
    name: 'username',
    type: String,
    description: 'The MAC address of the bridge (e.g., "0E:02:9A:9D:44:45")',
    example: '0E:02:9A:9D:44:45',
  })
  @ApiBody({ type: SetBridgeAlertDto })
  setBridgeHideMatterAlert(@Param('username') username: string, @Body() body: SetBridgeAlertDto) {
    return this.configEditorService.setBridgeHideMatterAlert(username, body.value)
  }

  @UseGuards(AdminGuard)
  @Put('/ui/bridges/:username/scheduled-restart-cron')
  @ApiOperation({ summary: 'Set the scheduledRestartCron for a specific child bridge.' })
  @ApiParam({
    name: 'username',
    type: String,
    description: 'The MAC address of the bridge (e.g., `0E:02:9A:9D:44:45`)',
    example: '0E:02:9A:9D:44:45',
  })
  @ApiBody({ type: SetScheduledRestartCronDto })
  setBridgeScheduledRestartCron(@Param('username') username: string, @Body() body: SetScheduledRestartCronDto) {
    return this.configEditorService.setBridgeScheduledRestartCron(username, body.value)
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

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get the Matter port range configuration.' })
  @Get('/matter/ports')
  getMatterPortRange() {
    return this.configEditorService.getMatterPortRange()
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Set the Matter port range configuration.' })
  @Put('/matter/ports')
  setMatterPortRange(@Body() body: PortRangeDto) {
    return this.configEditorService.setMatterPortRange(body)
  }

  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Get Matter Configuration',
    description: 'Returns the Matter configuration object for the main Homebridge bridge.',
  })
  @Get('/matter')
  getMatterConfig() {
    return this.configEditorService.getMatterConfig()
  }

  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Update Matter Configuration',
    description: 'Update the Matter configuration object for the main Homebridge bridge.',
  })
  @ApiBody({ description: 'Matter configuration', type: 'json' })
  @Put('/matter')
  updateMatterConfig(@Body() matterConfig) {
    return this.configEditorService.updateMatterConfig(matterConfig)
  }

  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Delete Matter Configuration',
    description: 'Removes the Matter configuration object for the main Homebridge bridge, and deletes the Matter data for it.',
  })
  @Delete('/matter')
  deleteMatterConfig() {
    return this.configEditorService.deleteMatterConfig()
  }

  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Get HAP enablement for the main bridge',
    description: 'Returns whether HAP is published for the main Homebridge bridge. HAP is on by default and is opted out via `bridge.hap: false`.',
  })
  @Get('/hap')
  getHapEnabled() {
    return this.configEditorService.getHapEnabled()
  }

  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Enable or disable HAP for the main bridge',
    description: 'Toggles `bridge.hap` for the main Homebridge bridge. Disabling requires `bridge.matter` to be configured.',
  })
  @ApiBody({ description: 'HAP enablement', type: 'json' })
  @Put('/hap')
  setHapEnabled(@Body() body: { enabled: boolean }) {
    return this.configEditorService.setHapEnabled(body.enabled)
  }
}
