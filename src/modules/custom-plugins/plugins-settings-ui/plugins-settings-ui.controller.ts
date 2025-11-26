import { Controller, Get, Inject, Param, Query, Res } from '@nestjs/common'
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger'

import { PluginsSettingsUiService } from './plugins-settings-ui.service.js'

@ApiTags('Plugins')
@Controller('plugins/settings-ui')
export class PluginsSettingsUiController {
  constructor(
    @Inject(PluginsSettingsUiService) private readonly pluginSettingsUiService: PluginsSettingsUiService,
  ) {}

  @Get('/:pluginName/*')
  @ApiOperation({ summary: 'Returns the HTML assets for a plugin\'s custom UI' })
  @ApiParam({ name: 'pluginName', type: 'string' })
  async serveCustomUiAsset(@Res() reply, @Param('pluginName') pluginName, @Param('*') file, @Query('origin') origin: string, @Query('v') v?: string) {
    return await this.pluginSettingsUiService.serveCustomUiAsset(reply, pluginName, file, origin, v)
  }
}
