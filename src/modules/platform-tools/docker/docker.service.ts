import * as fs from 'fs-extra';
import * as dotenv from 'dotenv';
import * as child_process from 'child_process';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '../../../core/config/config.service';
import { Logger } from '../../../core/logger/logger.service';

@Injectable()
export class DockerService {
  private dockerEnvVariables = [
    'HOMEBRIDGE_DEBUG',
    'HOMEBRIDGE_INSECURE',
  ];

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
    const cmd = 'killall s6-svscan';
    this.logger.log('Restarting the docker container, make sure you have --restart=always turned on or the container will not come back online');

    setTimeout(() => {
      child_process.exec('killall s6-svscan');
    }, 500);

    return { ok: true, command: cmd };
  }

  /**
   * Returns the local docker env
   */
  async getDockerEnv() {
    if (!await fs.pathExists(this.configService.dockerEnvFile)) {
      throw new NotFoundException();
    }

    const resp: any = {};
    const file = await fs.readFile(this.configService.dockerEnvFile);
    const env = dotenv.parse(file);

    for (const key of this.dockerEnvVariables) {
      resp[key] = env[key] || process.env[key] || undefined;
      if (resp[key] === '1') {
        resp[key] = true;
      } else if (resp[key] === '0') {
        resp[key] = false;
      }
    }

    return resp;
  }

  /**
   * Returns the local docker env
   */
  async updateDockerEnv(env) {
    const resp = ['### This will overide environment variables set using the docker run command ###'];

    for (const key of this.dockerEnvVariables) {
      if (env[key] !== undefined && env[key] !== null) {
        if (typeof (env[key]) === 'boolean') {
          env[key] = env[key] ? '1' : '0';
        }

        if (typeof env[key] === 'string' && !env[key].trim().length) {
          return;
        }

        resp.push(`${key}="${String(env[key]).trim()}"`);
      }
    }

    resp.push('### This file is managed by homebridge-config-ui-x ###');
    await fs.writeFile(this.configService.dockerEnvFile, resp.join('\n') + '\n');
  }
}
