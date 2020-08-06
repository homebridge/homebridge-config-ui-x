import * as fs from 'fs-extra';
import * as path from 'path';
import { Injectable, NotFoundException, GoneException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '../../../core/config/config.service';
import { Logger } from '../../../core/logger/logger.service';

@Injectable()
export class HbServiceService {
  private hbServiceSettingsPath = path.resolve(this.configService.storagePath, '.uix-hb-service-homebridge-startup.json');

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: Logger
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

  /**
   * Set the flag to trigger a full restart on next boot
   */
  async setFullServiceRestartFlag() {
    // restart ui on next restart
    this.configService.hbServiceUiRestartRequired = true;

    return { status: 0 };
  }

  /**
   * Stream the full log file to the client
   */
  async downloadLogFile() {
    if (!await fs.pathExists(this.configService.ui.log.path)) {
      this.logger.error(`Cannot download log file: "${this.configService.ui.log.path}" does not exist.`);
      throw new BadRequestException(`Log file not found on disk.`);
    }
    try {
      await fs.access(this.configService.ui.log.path, fs.constants.R_OK);
    } catch (e) {
      this.logger.error(`Cannot download log file: Missing read permissions on "${this.configService.ui.log.path}".`);
      throw new BadRequestException('Cannot read log file. Check the log file permissions');
    }
    return fs.createReadStream(this.configService.ui.log.path, 'utf8');
  }
}
