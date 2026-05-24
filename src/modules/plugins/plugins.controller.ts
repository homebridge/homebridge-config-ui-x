import { Controller, ForbiddenException, Get, Inject, Param, Post, Query, Request, UseGuards } from '@nestjs/common'
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

  @ApiOperation({
    summary: 'Get the list of currently installed Homebridge plugins.',
    description: 'Pass `?include=config` (admin only) to bundle each plugin\'s saved `config.json` blocks onto the response — used by the plugins page to avoid an N+1 fan-out over `/config-editor/plugin/:name`.',
  })
  @ApiQuery({
    name: 'include',
    type: 'string',
    required: false,
    description: 'Comma-separated list of optional extras to attach. Supported values: `config` (admin only).',
    example: 'config',
  })
  @Get()
  pluginsGet(@Request() req: any, @Query('include') include?: string) {
    const includes = (include ?? '').split(',').map(s => s.trim()).filter(Boolean)
    if (includes.includes('config')) {
      if (!req.user?.admin) {
        throw new ForbiddenException('Admin role required to include plugin config blocks.')
      }
      return this.pluginsService.getInstalledPluginsWithConfig()
    }
    return this.pluginsService.getInstalledPlugins()
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Clear the installed plugins cache.' })
  @Post('clear-cache')
  clearPluginsCache() {
    this.pluginsService.clearInstalledPluginsCache()
    return { success: true }
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
  @ApiOperation({ summary: 'Get the GitHub release notes and changelog for a specific version of a plugin.' })
  @ApiParam({ name: 'pluginName', type: 'string' })
  @ApiQuery({ name: 'version', type: 'string', required: false, description: 'Target version or dist-tag (e.g. "1.2.3", "beta", "latest")' })
  @Get('release/:pluginName')
  getPluginRelease(@Param('pluginName') pluginName, @Query('version') version?: string) {
    return this.pluginsService.getPluginRelease(pluginName, version)
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
    summary: 'Bundled context for plugin editor modals — alias, config schema, saved config blocks, and the plugin\'s child bridges.',
    description: 'Replaces the four-call fan-out (`/plugins/alias/:name`, `/plugins/config-schema/:name`, `/config-editor/plugin/:name`, `/status/homebridge/child-bridges`) the UI used to issue on every modal open. `configSchema` is `null` for plugins that ship without a `config.schema.json`.',
  })
  @ApiParam({ name: 'pluginName', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Editor context payload.',
    schema: {
      type: 'object',
      properties: {
        pluginName: { type: 'string' },
        alias: {
          type: 'object',
          properties: {
            pluginAlias: { type: 'string', nullable: true },
            pluginType: { type: 'string', enum: ['platform', 'accessory'], nullable: true },
          },
        },
        configSchema: { type: 'object', nullable: true },
        config: { type: 'array', items: { type: 'object' } },
        childBridges: { type: 'array', items: { type: 'object' } },
      },
    },
  })
  @Get(':pluginName/editor-context')
  getEditorContext(@Param('pluginName') pluginName: string) {
    return this.pluginsService.getEditorContext(pluginName)
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
