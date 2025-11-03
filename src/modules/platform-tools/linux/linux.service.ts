import { exec } from 'node:child_process'

import { Inject, Injectable } from '@nestjs/common'

import { ConfigService } from '../../../core/config/config.service.js'
import { Logger } from '../../../core/logger/logger.service.js'

@Injectable()
export class LinuxService {
  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(Logger) private readonly logger: Logger,
  ) {}

  /**
   * Reboot the host
   */
  restartHost() {
    const cmd = [(this.configService.ui.linux && this.configService.ui.linux.restart)
      ? this.configService.ui.linux.restart
      : 'sudo -n shutdown -r now']

    this.logger.warn(`Rebooting linux server with command ${cmd.join(' ')}.`)

    setTimeout(() => {
      exec(cmd.join(' '), (err) => {
        if (err) {
          this.logger.error(err.message)
        }
      })
    }, 100)

    return { ok: true, command: cmd }
  }

  /**
   * Shutdown the host
   */
  shutdownHost() {
    const cmd = [(this.configService.ui.linux && this.configService.ui.linux.shutdown)
      ? this.configService.ui.linux.shutdown
      : 'sudo -n shutdown -h now']

    this.logger.warn(`Shutting down linux server with command ${cmd.join(' ')}.`)

    setTimeout(() => {
      exec(cmd.join(' '), (err) => {
        if (err) {
          this.logger.error(err.message)
        }
      })
    }, 500)

    return { ok: true, command: cmd }
  }
}
