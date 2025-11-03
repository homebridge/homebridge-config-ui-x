import { exec } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'

import { Inject, Injectable } from '@nestjs/common'

import { ConfigService } from '../../../core/config/config.service.js'
import { Logger } from '../../../core/logger/logger.service.js'

@Injectable()
export class DockerService {
  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(Logger) private readonly logger: Logger,
  ) {}

  /**
   * Returns the docker startup.sh script
   */
  async getStartupScript() {
    try {
      const script = await readFile(this.configService.startupScript, 'utf-8')
      return { script }
    } catch (error) {
      this.logger.error('Error reading startup script:', error)
      throw new Error('Could not read the startup script.')
    }
  }

  /**
   * Updates the docker startup.sh script
   * @param script
   */
  async updateStartupScript(script: string) {
    await writeFile(this.configService.startupScript, script)
    return { script }
  }

  /**
   * Restarts the docker container
   */
  async restartDockerContainer() {
    const cmd = 'sudo kill 1'

    this.logger.log('Restarting the docker container, make sure you have --restart=always turned on or the container will not come back online.')

    setTimeout(() => {
      exec(cmd)
    }, 500)

    return { ok: true, command: cmd }
  }
}
