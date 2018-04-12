/* This class and it's methods are only used when running in the oznu/homebridge docker container */

import * as path from 'path';
import * as fs from 'fs-extra';
import * as child_process from 'child_process';
import * as dotenv from 'dotenv';
import { Router, Request, Response, NextFunction } from 'express';

import { hb } from '../../hb';
import { users } from '../../users';

export class DockerRouter {
  public router: Router;
  private startupScriptPath: string;
  private dockerEnvPath: string;

  private dockerEnvVariables = [
    'HOMEBRIDGE_DEBUG',
    'HOMEBRIDGE_INSECURE',
    'HOMEBRIDGE_CONFIG_UI_THEME',
    'HOMEBRIDGE_CONFIG_UI_AUTH',
    'HOMEBRIDGE_CONFIG_UI_LOGIN_WALLPAPER',
  ];

  constructor() {
    this.router = Router();

    this.router.get('/startup-script', users.ensureAdmin, this.getStartupScript.bind(this));
    this.router.post('/startup-script', users.ensureAdmin, this.saveStartupScript.bind(this));
    this.router.get('/env', users.ensureAdmin, this.getDockerEnv.bind(this));
    this.router.put('/env', users.ensureAdmin, this.saveDockerEnv.bind(this));
    this.router.put('/restart-container', users.ensureAdmin, this.restartContainer);

    this.dockerEnvPath = path.resolve(hb.storagePath, '.docker.env');
    this.startupScriptPath = path.resolve(hb.storagePath, 'startup.sh');
  }

  getStartupScript(req: Request, res: Response, next: NextFunction) {
    res.header({'content-type': 'text/plain'});
    return res.sendFile(this.startupScriptPath);
  }

  saveStartupScript(req: Request, res: Response, next: NextFunction) {
    return fs.writeFile(this.startupScriptPath, req.body.script)
      .then(() => {
        hb.log('Updated startup.sh script');
        return res.status(202).json({ok: true});
      })
      .catch(next);
  }

  restartContainer(req: Request, res: Response, next: NextFunction) {
    hb.log('Request to restart docker container received');
    res.status(202).json({ ok: true });

    setTimeout(() => {
      child_process.exec('killall s6-svscan');
    }, 100);
  }

  async getDockerEnv(req: Request, res: Response, next: NextFunction) {
    if (!fs.existsSync(this.dockerEnvPath)) {
      return res.sendStatus(404);
    }

    const resp: any = {};
    const file = await fs.readFile(this.dockerEnvPath);
    const env = dotenv.parse(file);

    this.dockerEnvVariables.forEach((key) => {
      resp[key] = env[key] || process.env[key] || undefined;
      if (resp[key] === '1') {
        resp[key] = true;
      } else if (resp[key] === '0') {
        resp[key] = false;
      }
    });

    return res.json(resp);
  }

  async saveDockerEnv(req: Request, res: Response, next: NextFunction) {
    const resp = ['### This will overide environment variables set using the docker run command ###'];

    this.dockerEnvVariables.forEach((key) => {
      if (req.body[key] !== undefined && req.body[key] !== null) {
        if (typeof (req.body[key]) === 'boolean') {
          req.body[key] = req.body[key] ? '1' : '0';
        }

        if (typeof req.body[key] === 'string' && !req.body[key].trim().length) {
          return;
        }

        resp.push(`${key}="${String(req.body[key]).trim()}"`);
      }
    });

    resp.push('### This file is managed by homebridge-config-ui-x ###');
    await fs.writeFile(this.dockerEnvPath, resp.join('\n') + '\n');
    res.json({ok: true});
  }
}
