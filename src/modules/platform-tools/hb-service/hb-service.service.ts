import * as fs from 'fs-extra';
import * as path from 'path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../../core/config/config.service';

@Injectable()
export class HbServiceService {
  private hbServiceSettingsPath = path.resolve(this.configService.storagePath, '.uix-hb-service-homebridge-startup.json');

  constructor(
    private readonly configService: ConfigService,
  ) { }

  /**
   * Returns the Homebridge startup settings
   */
  async getHomebridgeStartupSettings() {
    try {
      if (await fs.pathExists(this.hbServiceSettingsPath)) {
        const settings = await fs.readJson(this.hbServiceSettingsPath);

        return {
          HOMEBRIDGE_DEBUG: settings.debugMode,
          HOMEBRIDGE_KEEP_ORPHANS: settings.keepOrphans,
          HOMEBRIDGE_INSECURE: typeof settings.insecureMode === 'boolean' ? settings.insecureMode : this.configService.homebridgeInsecureMode,
          ENV_DEBUG: settings.env.DEBUG,
          ENV_NODE_OPTIONS: settings.env.NODE_OPTIONS,
        };

      } else {
        return {
          HOMEBRIDGE_INSECURE: this.configService.homebridgeInsecureMode,
        };
      }
    } catch (e) {
      return {};
    }
  }

  /**
   * Sets the Homebridge startup settings
   */
  async setHomebridgeStartupSettings(data) {
    // restart ui on next restart
    this.configService.hbServiceUiRestartRequired = true;

    // format the settings payload
    const settings = {
      debugMode: data.HOMEBRIDGE_DEBUG,
      keepOrphans: data.HOMEBRIDGE_KEEP_ORPHANS,
      insecureMode: data.HOMEBRIDGE_INSECURE,
      env: {
        DEBUG: data.ENV_DEBUG ? data.ENV_DEBUG : undefined,
        NODE_OPTIONS: data.ENV_NODE_OPTIONS ? data.ENV_NODE_OPTIONS : undefined,
      },
    };

    return fs.writeJsonSync(this.hbServiceSettingsPath, settings, { spaces: 4 });
  }

  async setFullServiceRestartFlag() {
    // restart ui on next restart
    this.configService.hbServiceUiRestartRequired = true;

    return { status: 0 };
  }
}
