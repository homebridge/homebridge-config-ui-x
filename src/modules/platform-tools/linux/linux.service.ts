import { exec, spawn } from 'node:child_process'

import { BadRequestException, Inject, Injectable } from '@nestjs/common'

import { ConfigService } from '../../../core/config/config.service.js'
import { Logger } from '../../../core/logger/logger.service.js'
import { RE_SAFE_RESTART_CMD } from '../../../core/regex.constants.js'

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
    const cmd = (this.configService.ui.linux && this.configService.ui.linux.restart)
      ? this.configService.ui.linux.restart
      : 'sudo -n shutdown -r now'

    this.logger.warn(`Rebooting linux server with command ${cmd}.`)
    this.runHostCommand(cmd, 100)

    return { ok: true, command: cmd }
  }

  /**
   * Shutdown the host
   */
  shutdownHost() {
    const cmd = (this.configService.ui.linux && this.configService.ui.linux.shutdown)
      ? this.configService.ui.linux.shutdown
      : 'sudo -n shutdown -h now'

    this.logger.warn(`Shutting down linux server with command ${cmd}.`)
    this.runHostCommand(cmd, 500)

    return { ok: true, command: cmd }
  }

  /**
   * Execute a configured host command. Uses `spawn` with `shell: false`
   * and an argv array so config-supplied values can't be interpreted as
   * shell syntax. The command itself is validated against the same
   * allowlist enforced at save time (RE_SAFE_RESTART_CMD); a stored
   * legacy value that doesn't match is refused rather than passed to a
   * shell.
   */
  private runHostCommand(command: string, delayMs: number) {
    if (!RE_SAFE_RESTART_CMD.test(command)) {
      this.logger.error(`Refusing to run host command — not on the allowlist: "${command}". Edit ui.linux.restart / ui.linux.shutdown to use a supported form (e.g. "sudo -n shutdown -r now").`)
      return
    }
    const argv = command.split(/\s+/).filter(Boolean)
    setTimeout(() => {
      const child = spawn(argv[0], argv.slice(1), { stdio: 'ignore', shell: false })
      child.on('error', (err) => {
        this.logger.error(err.message)
      })
    }, delayMs)
  }

  /**
   * Update the homebridge apt package using a fixed command.
   */
  updateAptPackage() {
    if (!this.configService.runningInPackageMode) {
      throw new BadRequestException('This action is only available for apt package installs.')
    }

    const cmd = [
      'sudo -n HOMEBRIDGE_CONFIG_UI_TERMINAL=0 /usr/bin/apt-get update',
      'sudo -n HOMEBRIDGE_CONFIG_UI_TERMINAL=0 /usr/bin/apt-get install --only-upgrade -y homebridge',
    ]

    this.logger.warn(`Updating homebridge apt package with command ${cmd.join(' && ')}.`)

    setTimeout(() => {
      exec(cmd.join(' && '), (err) => {
        if (err) {
          this.logger.error(err.message)
        }
      })
    }, 100)

    return { ok: true, command: cmd }
  }
}
