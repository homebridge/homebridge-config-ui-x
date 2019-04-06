import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { PluginsService } from './plugins.service';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from '../../core/auth/guards/admin.guard';

@UseGuards(AuthGuard())
@Controller('plugins')
export class PluginsController {

  constructor(
    private pluginsService: PluginsService,
  ) { }

  @Get()
  pluginsGet() {
    return this.pluginsService.getInstalledPlugins();
  }

  @UseGuards(AdminGuard)
  @Get('search/:query')
  pluginsSearch(@Param() param) {
    return this.pluginsService.searchNpmRegistry(param.query);
  }

  @UseGuards(AdminGuard)
  @Get('config-schema/:pluginName')
  getPluginConfigSchema(@Param() param) {
    return this.pluginsService.getPluginConfigSchema(param.pluginName);
  }

  @UseGuards(AdminGuard)
  @Get('changelog/:pluginName')
  getPluginChangeLog(@Param() param) {
    return this.pluginsService.getPluginChangeLog(param.pluginName);
  }

  @UseGuards(AdminGuard)
  @Get('release/:pluginName')
  getPluginRelease(@Param() param) {
    return this.pluginsService.getPluginRelease(param.pluginName);
  }
}
