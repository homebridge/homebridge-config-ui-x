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
  pluginsSearch(@Param() param) {
    return this.pluginsService.searchNpmRegistry(param.query);
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Lookup a single plugin from the NPM registry' })
  @ApiParam({ name: 'pluginName', type: 'string' })
  @Get('lookup/:pluginName')
  pluginLookup(@Param('pluginName') pluginName) {
    return this.pluginsService.lookupPlugin(pluginName);
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get the config.schema.json for a plugin.' })
  @ApiParam({ name: 'pluginName', type: 'string' })
  @Get('config-schema/:pluginName')
  getPluginConfigSchema(@Param() param) {
    return this.pluginsService.getPluginConfigSchema(param.pluginName);
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get the CHANGELOG.md (post install) for a plugin.' })
  @ApiParam({ name: 'pluginName', type: 'string' })
  @Get('changelog/:pluginName')
  getPluginChangeLog(@Param() param) {
    return this.pluginsService.getPluginChangeLog(param.pluginName);
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get the latest GitHub release notes for a plugin.' })
  @ApiParam({ name: 'pluginName', type: 'string' })
  @Get('release/:pluginName')
  getPluginRelease(@Param() param) {
    return this.pluginsService.getPluginRelease(param.pluginName);
  }
}
