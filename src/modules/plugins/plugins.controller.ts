import { Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger'

import { AdminGuard } from '../../core/auth/guards/admin.guard.js'
import { PluginsService } from './plugins.service.js'

@ApiTags('Plugins')
@ApiBearerAuth()
@UseGuards(AuthGuard())
@Controller('plugins')
export class PluginsController {
  constructor(
    @Inject(PluginsService) private readonly pluginsService: PluginsService,
  ) {}

  @ApiOperation({ summary: 'Get the list of currently installed Homebridge plugins.' })
  @Get()
  pluginsGet() {
    return this.pluginsService.getInstalledPlugins()
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Search the NPM registry for Homebridge plugins.' })
  @ApiParam({ name: 'query', type: 'string' })
  @Get('search/:query')
  pluginsSearch(@Param('query') query) {
    return this.pluginsService.searchNpmRegistry(query.trim())
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Lookup a single plugin from the NPM registry.' })
  @ApiParam({ name: 'pluginName', type: 'string' })
  @Get('lookup/:pluginName')
  pluginLookup(@Param('pluginName') pluginName) {
    return this.pluginsService.lookupPlugin(pluginName)
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get the available versions and tags for a single plugin from the NPM registry.' })
  @ApiParam({ name: 'pluginName', type: 'string' })
  @Get('lookup/:pluginName/versions')
  getAvailablePluginVersions(@Param('pluginName') pluginName) {
    return this.pluginsService.getAvailablePluginVersions(pluginName)
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get the `config.schema.json` for a plugin.' })
  @ApiParam({ name: 'pluginName', type: 'string' })
  @Get('config-schema/:pluginName')
  getPluginConfigSchema(@Param('pluginName') pluginName) {
    try {
      return this.pluginsService.getPluginConfigSchema(pluginName)
    } catch (e) {
      console.error(e)
    }
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get the `CHANGELOG.md` (post install) for a plugin.' })
  @ApiParam({ name: 'pluginName', type: 'string' })
  @Get('changelog/:pluginName')
  getPluginChangeLog(@Param('pluginName') pluginName) {
    return this.pluginsService.getPluginChangeLog(pluginName)
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get the latest GitHub release notes and latest changelog for a plugin.' })
  @ApiParam({ name: 'pluginName', type: 'string' })
  @Get('release/:pluginName')
  getPluginRelease(@Param('pluginName') pluginName) {
    return this.pluginsService.getPluginRelease(pluginName)
  }

  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Attempt to resolve the type (platform or accessory) and alias for a plugin.',
    description: 'NOTE: `pluginAlias` and `pluginType` will be `null` if the type or alias could not be resolved.',
  })
  @ApiParam({ name: 'pluginName', type: 'string' })
  @Get('alias/:pluginName')
  getPluginAlias(@Param('pluginName') pluginName) {
    return this.pluginsService.getPluginAlias(pluginName)
  }

  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Trigger an update for Homebridge, homebridge-config-ui-x, or any plugin.',
    description: 'This endpoint queues an update to be performed in the background. The update will be executed asynchronously and the appropriate restart will be performed based on what was updated.',
  })
  @ApiParam({
    name: 'pluginName',
    type: String,
    description: 'The name of the package to update (homebridge, homebridge-config-ui-x, or a plugin name)',
    example: 'homebridge-example-plugin',
  })
  @ApiQuery({
    name: 'version',
    type: String,
    required: false,
    description: 'Specific version to install. If not provided, the latest version will be installed.',
    example: '1.2.3',
  })
  @ApiResponse({
    status: 201,
    description: 'Update has been queued successfully.',
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean', example: true },
        name: { type: 'string', example: 'homebridge-example-plugin' },
        version: { type: 'string', example: '1.2.3' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid package name or validation error.',
  })
  @ApiResponse({
    status: 404,
    description: 'Package not installed.',
  })
  @Post('update/:pluginName')
  triggerUpdate(@Param('pluginName') pluginName: string, @Query('version') version?: string) {
    return this.pluginsService.triggerUpdate(pluginName, version)
  }
}
