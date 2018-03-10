/* This class and it's methods are only used when running in the oznu/homebridge docker container */

import * as path from 'path';
import * as fs from 'fs-extra';
import * as child_process from 'child_process';
import { Router, Request, Response, NextFunction } from 'express';

import { hb } from '../hb';
import { users } from '../users';

export class DockerRouter {
  public router: Router;

  constructor() {
    this.router = Router();

    this.router.get('/startup-script', users.ensureAdmin, this.getStartupScript);
    this.router.post('/startup-script', users.ensureAdmin, this.saveStartupScript);
    this.router.put('/restart-container', users.ensureAdmin, this.restartContainer);
  }

  getStartupScript(req: Request, res: Response, next: NextFunction) {
    res.header({'content-type': 'text/plain'});
    return res.sendFile(path.resolve(hb.storagePath, 'startup.sh'));
  }

  saveStartupScript(req: Request, res: Response, next: NextFunction) {
    return fs.writeFile(path.resolve(hb.storagePath, 'startup.sh'), req.body.script)
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
}
