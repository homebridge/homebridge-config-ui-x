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
  private dockerSystem: string;

  private dockerEnvVariables = [
    'HOMEBRIDGE_DEBUG',
    'HOMEBRIDGE_INSECURE',
    'HOMEBRIDGE_CONFIG_UI_THEME',
    'HOMEBRIDGE_CONFIG_UI_AUTH'
  ];

  private dockerPackages = [
    {
      name: 'ffmpeg',
      alpine: 'apk add --no-cache ffmpeg ffmpeg-libs',
      debian: 'apt-get update && apt-get install -y ffmpeg',
      installed: false
    }, {
      name: 'libpcap-dev',
      alpine: 'apk add --no-cache libpcap-dev',
      debian: 'apt-get update && apt-get install -y libpcap-dev',
      installed: false
    }
  ];

  constructor() {
    this.router = Router();

    this.router.get('/startup-script', users.ensureAdmin, this.getStartupScript.bind(this));
    this.router.post('/startup-script', users.ensureAdmin, this.saveStartupScript.bind(this));
    this.router.get('/env', users.ensureAdmin, this.getDockerEnvHandler.bind(this));
    this.router.put('/env', users.ensureAdmin, this.saveDockerEnvHandler.bind(this));
    this.router.put('/restart-container', users.ensureAdmin, this.restartContainer);

    this.dockerEnvPath = path.resolve(hb.storagePath, '.docker.env');
    this.startupScriptPath = path.resolve(hb.storagePath, 'startup.sh');

    this.osType();
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

  getDockerEnvHandler(req: Request, res: Response, next: NextFunction) {
    if (!fs.existsSync(this.dockerEnvPath)) {
      return res.sendStatus(404);
    }

    return this.getDockerEnv()
      .then((data) => {
        res.json(data);
      })
      .catch(next);
  }

  saveDockerEnvHandler(req: Request, res: Response, next: NextFunction) {
    return this.saveDockerEnv(req.body)
      .then(() => {
        hb.log('Docker settings saved to', this.dockerEnvPath);
        return res.status(202).json({ok: true});
      })
      .catch(next);
  }

  async getDockerEnv() {
    const resp: any = {};

    // load startup.sh and parse
    let startup: any = await fs.readFile(this.startupScriptPath, 'utf8');
    startup = startup.split('\n');

    resp.packages = [];

    this.dockerPackages.forEach((pkg) => {
      if (startup.find(x => x === pkg[this.dockerSystem])) {
        pkg.installed = true;
        resp.packages.push(pkg);
      } else {
        pkg.installed = false;
        resp.packages.push(pkg);
      }
    });

    // load .docker.env file
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

    return resp;
  }

  async saveDockerEnv(body) {
    // load startup.sh, parse and write out changes
    let startup: any = await fs.readFile(this.startupScriptPath, 'utf8');
    startup = startup.split('\n');

    body.packages.forEach((pkg) => {
      if (startup.find(x => x === pkg[this.dockerSystem])) {
        if (!pkg.installed) {
          startup.splice(startup.findIndex(x => x === pkg[this.dockerSystem]), 1);
        }
      } else {
        if (pkg.installed) {
          startup.push(pkg[this.dockerSystem]);
        }
      }
    });

    await fs.writeFile(this.startupScriptPath, startup.join('\n'));

    // parse and write out env vars
    const resp = ['### This will overide environment variables set using the docker run command ###'];

    this.dockerEnvVariables.forEach((key) => {
      if (body[key] !== undefined) {
        if (typeof (body[key]) === 'boolean') {
          body[key] = body[key] ? '1' : '0';
        }

        resp.push(`${key}="${String(body[key])}"`);
      }
    });

    return fs.writeFile(this.dockerEnvPath, resp.join('\n') + '\n');
  }

  async osType() {
    try {
      const file = await fs.readFile('/etc/os-release');
      const env = dotenv.parse(file);
      this.dockerSystem = env.ID;
    } catch (e) {
      hb.warn('Could not determine Docker OS type, defaulting to Alpine Linux.');
      this.dockerSystem = 'alpine';
    }
  }
}
