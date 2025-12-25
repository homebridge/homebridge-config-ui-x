import { constants, createReadStream } from 'node:fs'
import { access, truncate } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Transform } from 'node:stream'

import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { pathExists, readJson, writeJsonSync } from 'fs-extra/esm'

import { ConfigService } from '../../../core/config/config.service.js'
import { Logger } from '../../../core/logger/logger.service.js'
import { HbServiceStartupSettings } from './hb-service.dto.js'

@Injectable()
export class HbServiceService {
  private readonly hbServiceSettingsPath: string

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(Logger) private readonly logger: Logger,
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
    // Restart ui on next restart
    this.configService.hbServiceUiRestartRequired = true

    // Format the settings payload
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
    // Restart ui on next restart
    this.configService.hbServiceUiRestartRequired = true

    return { status: 0 }
  }

  /**
   * Stream the full log file to the client
   */
  async downloadLogFile(shouldRemoveColour: boolean) {
    if (!await pathExists(this.configService.ui.log.path)) {
      this.logger.error(`Cannot download log file ${this.configService.ui.log.path} as it does not exist.`)
      throw new BadRequestException('Log file not found on disk.')
    }
    try {
      await access(this.configService.ui.log.path, constants.R_OK)
    } catch (e) {
      this.logger.error(`Cannot download log file as missing read permissions on ${this.configService.ui.log.path}.`)
      throw new BadRequestException('Cannot read log file. Check the log file permissions.')
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
      this.logger.error(`Cannot truncate log file ${this.configService.ui.log.path} as it does not exist.`)
      throw new BadRequestException('Log file not found on disk.')
    }
    try {
      await access(this.configService.ui.log.path, constants.R_OK | constants.W_OK)
    } catch (e) {
      this.logger.error(`Cannot truncate log file as missing write permissions on ${this.configService.ui.log.path}.`)
      throw new BadRequestException('Cannot access file. Check the log file permissions.')
    }

    await truncate(this.configService.ui.log.path)

    setTimeout(() => {
      this.logger.warn(`Homebridge log truncated by ${username || 'user'}.`)
    }, 1000)

    return { status: 0 }
  }
}
