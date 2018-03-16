/* This class and it's methods are only used when running on linux */

import * as child_process from 'child_process';
import { Router, Request, Response, NextFunction } from 'express';

import { hb } from '../../hb';
import { users } from '../../users';

export class LinuxRouter {
  public router: Router;

  constructor() {
    this.router = Router();

    this.router.put('/restart-server', users.ensureAdmin, this.restartServer);
    this.router.put('/shutdown-server', users.ensureAdmin, this.shutdownServer);
  }

  restartServer(req: Request, res: Response, next: NextFunction) {
    hb.warn('Request to restart linux server received');
    res.status(202).json({ ok: true });

    let cmd: any = [hb.linuxServerOpts.restart || 'shutdown -r now'];

    if (hb.useSudo) {
      cmd.unshift('sudo -n');
    }

    cmd = cmd.join(' ');

    hb.warn('Running restart command:', cmd);

    setTimeout(() => {
      child_process.exec(cmd, (err) => {
        if (err) {
          hb.error(err.message);
        }
      });
    }, 100);
  }

  shutdownServer(req: Request, res: Response, next: NextFunction) {
    hb.warn('Request to shutdown linux server received');
    res.status(202).json({ ok: true });

    let cmd: any = [hb.linuxServerOpts.shutdown || 'shutdown -h now'];

    if (hb.useSudo) {
      cmd.unshift('sudo -n');
    }

    cmd = cmd.join(' ');

    hb.warn('Running shutdown command', cmd);

    setTimeout(() => {
      child_process.exec(cmd, (err) => {
        if (err) {
          hb.error(err.message);
        }
      });
    }, 100);
  }
}
