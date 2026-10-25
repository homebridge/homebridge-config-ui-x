import { constants, createReadStream } from 'node:fs'
import { access, truncate } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Transform } from 'node:stream'

import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { pathExists, readJson, writeJsonSync } from 'fs-extra/esm'

import { ConfigService } from '../../../core/config/config.service.js'
import { Logger } from '../../../core/logger/logger.service.js'
import { RE_ANSI_COLOUR, RE_ANSI_COLOUR_UNFINISHED } from '../../../core/regex.constants.js'
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
          HOMEBRIDGE_INSECURE: typeof settings.insecureMode === 'boolean'
            ? settings.insecureMode
            : this.configService.homebridgeInsecureMode,
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

    // The colored log is sent exactly as it is on disk, so it streams as raw
    // bytes. Decoded utf8 strings would only be re-encoded on the way out, and
    // string chunks holding multi-byte characters can stall a chunked response
    // under backpressure (https://github.com/nodejs/node/issues/66781).
    if (!shouldRemoveColour) {
      return createReadStream(this.configService.ui.log.path)
    }

    // Color codes are stripped chunk by chunk, so a code that a chunk boundary
    // cuts short is held back and stripped once the next chunk finishes it. The
    // stream decodes utf8 so multi-byte characters stay whole across chunks.
    let unfinished = ''

    const removeColor = new Transform({
      decodeStrings: false,
      transform(chunk: string, _encoding, callback) {
        const text = unfinished + chunk
        const lastEscape = text.lastIndexOf('\u001B')

        unfinished = (lastEscape !== -1 && RE_ANSI_COLOUR_UNFINISHED.test(text.slice(lastEscape)))
          ? text.slice(lastEscape)
          : ''
        callback(null, text.slice(0, text.length - unfinished.length).replace(RE_ANSI_COLOUR, ''))
      },
      flush(callback) {
        callback(null, unfinished)
      },
    })

    return createReadStream(this.configService.ui.log.path, { encoding: 'utf8' })
      .pipe(removeColor)
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
