import * as fs from 'fs-extra';
import * as child_process from 'child_process';
import { Injectable } from '@nestjs/common';

import { ConfigService } from '../../../core/config/config.service';
import { Logger } from '../../../core/logger/logger.service';

@Injectable()
export class DockerService {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: Logger,
  ) { }

  /**
   * Returns the docker startup.sh script
   */
  async getStartupScript() {
    const script = await fs.readFile(this.configService.startupScript, 'utf-8');
    return { script };
  }

  /**
   * Updates the docker startup.sh script
   * @param script
   */
  async updateStartupScript(script: string) {
    await fs.writeFile(this.configService.startupScript, script);
    return { script };
  }

  /**
   * Restarts the docker container
   */
  async restartDockerContainer() {
    const cmd = 'sudo kill 1';

    this.logger.log('Restarting the docker container, make sure you have --restart=always turned on or the container will not come back online');

    setTimeout(() => {
      child_process.exec(cmd);
    }, 500);

    return { ok: true, command: cmd };
  }
}
