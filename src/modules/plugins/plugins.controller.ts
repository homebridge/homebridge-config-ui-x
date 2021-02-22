import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiParam, ApiOperation } from '@nestjs/swagger';
import { PluginsService } from './plugins.service';
import { AdminGuard } from '../../core/auth/guards/admin.guard';

@ApiTags('Plugins')
@ApiBearerAuth()
@UseGuards(AuthGuard())
@Controller('plugins')
export class PluginsController {
  constructor(
    private pluginsService: PluginsService,
  ) { }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'List of currently installed Homebridge plugins.' })
  @Get()
  pluginsGet() {
    return this.pluginsService.getInstalledPlugins();
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Search the NPM registry for Homebridge plugins.' })
  @ApiParam({ name: 'query', type: 'string' })
  @Get('search/:query')
  pluginsSearch(@Param('query') query) {
    return this.pluginsService.searchNpmRegistry(query.trim());
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Lookup a single plugin from the NPM registry.' })
  @ApiParam({ name: 'pluginName', type: 'string' })
  @Get('lookup/:pluginName')
  pluginLookup(@Param('pluginName') pluginName) {
    return this.pluginsService.lookupPlugin(pluginName);
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get the available versions and tags for a single plugin from the NPM registry.' })
  @ApiParam({ name: 'pluginName', type: 'string' })
  @Get('lookup/:pluginName/versions')
  getAvailablePluginVersions(@Param('pluginName') pluginName) {
    return this.pluginsService.getAvailablePluginVersions(pluginName);
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get the config.schema.json for a plugin.' })
  @ApiParam({ name: 'pluginName', type: 'string' })
  @Get('config-schema/:pluginName')
  getPluginConfigSchema(@Param('pluginName') pluginName) {
    try {
      return this.pluginsService.getPluginConfigSchema(pluginName);
    } catch (e) {
      console.log('did throw error');
      console.error(e);
    }
    return;
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get the CHANGELOG.md (post install) for a plugin.' })
  @ApiParam({ name: 'pluginName', type: 'string' })
  @Get('changelog/:pluginName')
  getPluginChangeLog(@Param('pluginName') pluginName) {
    return this.pluginsService.getPluginChangeLog(pluginName);
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get the latest GitHub release notes for a plugin.' })
  @ApiParam({ name: 'pluginName', type: 'string' })
  @Get('release/:pluginName')
  getPluginRelease(@Param('pluginName') pluginName) {
    return this.pluginsService.getPluginRelease(pluginName);
  }

  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Attempt to resolve the type (platform or accessory) and alias for a plugin.',
    description: '**Warning**: pluginAlias and pluginType will be `null` if the type or alias could not be resolved.',
  })
  @ApiParam({ name: 'pluginName', type: 'string' })
  @Get('alias/:pluginName')
  getPluginAlias(@Param('pluginName') pluginName) {
    return this.pluginsService.getPluginAlias(pluginName);
  }
}
