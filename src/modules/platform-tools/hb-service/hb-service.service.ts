import { resolve } from 'node:path'
import { Transform } from 'node:stream'

import { BadRequestException, Injectable } from '@nestjs/common'
import {
  access,
  constants,
  createReadStream,
  pathExists,
  readJson,
  truncate,
  writeJsonSync,
} from 'fs-extra'

import { ConfigService } from '../../../core/config/config.service'
import { Logger } from '../../../core/logger/logger.service'
import { HbServiceStartupSettings } from './hb-service.dto'

@Injectable()
export class HbServiceService {
  private readonly hbServiceSettingsPath: string

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: Logger,
  ) {
    this.hbServiceSettingsPath = resolve(this.configService.storagePath, '.uix-hb-service-homebridge-startup.json')
  }

  /**
   * Returns the Homebridge startup settings
   */
  async getHomebridgeStartupSettings() {
    try {
      if (await pathExists(this.hbServiceSettingsPath)) {
        const settings = await readJson(this.hbServiceSettingsPath)

        return {
          HOMEBRIDGE_DEBUG: settings.debugMode,
          HOMEBRIDGE_KEEP_ORPHANS: settings.keepOrphans,
          HOMEBRIDGE_INSECURE: typeof settings.insecureMode === 'boolean' ? settings.insecureMode : this.configService.homebridgeInsecureMode,
          ENV_DEBUG: settings.env.DEBUG,
          ENV_NODE_OPTIONS: settings.env.NODE_OPTIONS,
        }
      } else {
        return {
          HOMEBRIDGE_INSECURE: this.configService.homebridgeInsecureMode,
        }
      }
    } catch (e) {
      return {}
    }
  }

  /**
   * Sets the Homebridge startup settings
   */
  async setHomebridgeStartupSettings(data: HbServiceStartupSettings) {
    // restart ui on next restart
    this.configService.hbServiceUiRestartRequired = true

    // format the settings payload
    const settings = {
      debugMode: data.HOMEBRIDGE_DEBUG,
      keepOrphans: data.HOMEBRIDGE_KEEP_ORPHANS,
      insecureMode: data.HOMEBRIDGE_INSECURE,
      env: {
        DEBUG: data.ENV_DEBUG ? data.ENV_DEBUG : undefined,
        NODE_OPTIONS: data.ENV_NODE_OPTIONS ? data.ENV_NODE_OPTIONS : undefined,
      },
    }

    return writeJsonSync(this.hbServiceSettingsPath, settings, { spaces: 4 })
  }

  /**
   * Set the flag to trigger a full restart on next boot
   */
  async setFullServiceRestartFlag() {
    // restart ui on next restart
    this.configService.hbServiceUiRestartRequired = true

    return { status: 0 }
  }

  /**
   * Stream the full log file to the client
   */
  async downloadLogFile(shouldRemoveColour: boolean) {
    if (!await pathExists(this.configService.ui.log.path)) {
      this.logger.error(`Cannot download log file: "${this.configService.ui.log.path}" does not exist.`)
      throw new BadRequestException('Log file not found on disk.')
    }
    try {
      await access(this.configService.ui.log.path, constants.R_OK)
    } catch (e) {
      this.logger.error(`Cannot download log file: Missing read permissions on "${this.configService.ui.log.path}".`)
      throw new BadRequestException('Cannot read log file. Check the log file permissions')
    }

    if (shouldRemoveColour) {
      return createReadStream(this.configService.ui.log.path, { encoding: 'utf8' })
    }

    const removeColour = new Transform({
      transform(chunk, _encoding, callback) {
        // eslint-disable-next-line no-control-regex
        callback(null, chunk.toString().replace(/\x1B\[(\d{1,3}(;\d{1,2})?)?[mGK]/g, ''))
      },
    })

    return createReadStream(this.configService.ui.log.path, { encoding: 'utf8' })
      .pipe(removeColour)
  }

  /**
   * Truncate the log file
   */
  async truncateLogFile(username?: string) {
    if (!await pathExists(this.configService.ui.log.path)) {
      this.logger.error(`Cannot truncate log file: "${this.configService.ui.log.path}" does not exist.`)
      throw new BadRequestException('Log file not found on disk.')
    }
    try {
      await access(this.configService.ui.log.path, constants.R_OK | constants.W_OK)
    } catch (e) {
      this.logger.error(`Cannot truncate log file: Missing write permissions on "${this.configService.ui.log.path}".`)
      throw new BadRequestException('Cannot access file. Check the log file permissions')
    }

    await truncate(this.configService.ui.log.path)

    setTimeout(() => {
      this.logger.warn(`Homebridge log truncated by ${username || 'user'}.`)
    }, 1000)

    return { status: 0 }
  }
}
