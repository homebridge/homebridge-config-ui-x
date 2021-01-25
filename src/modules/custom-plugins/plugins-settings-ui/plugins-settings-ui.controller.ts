import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { PluginsSettingsUiService } from './plugins-settings-ui.service';

@ApiTags('Plugins')
@Controller('plugins/settings-ui')
export class PluginsSettingsUiController {

  constructor(
    private pluginSettingsUiService: PluginsSettingsUiService,
  ) { }

  @Get('/:pluginName/*')
  @ApiOperation({ summary: 'Returns the HTML assets for a plugin\'s custom UI' })
  @ApiParam({ name: 'pluginName', type: 'string' })
  async serveCustomUiAsset(@Res() reply, @Param('pluginName') pluginName, @Param('*') file, @Query('origin') origin: string) {
    return await this.pluginSettingsUiService.serveCustomUiAsset(reply, pluginName, file, origin);
  }

}
