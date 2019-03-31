import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { PluginsService } from './plugins.service';
import { AuthGuard } from '@nestjs/passport';

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

  @Get('search/:query')
  pluginsSearch(@Param() param) {
    return this.pluginsService.searchNpmRegistry(param.query);
  }
}
