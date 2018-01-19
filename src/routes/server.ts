import * as qr from 'qr-image';
import * as child_process from 'child_process';
import { Router, Request, Response, NextFunction } from 'express';

import { hb } from '../hb';
import { users } from '../users';
import { qrcode } from '../qrcode';

export class ServerRouter {
  public router: Router;
  private config;

  constructor() {
    this.router = Router();
    this.config = require(hb.configPath);

    this.router.get('/', this.getServer);
    this.router.put('/restart', this.restartServer);
    this.router.get('/qrcode.svg', this.getQrCode);
    this.router.get('/token', this.getToken);
  }

  getServer (req: Request, res: Response, next: NextFunction) {
    return res.json({
      port: this.config.bridge.port,
      console_port: hb.port,
      pin: this.config.bridge.pin
    });
  }

  restartServer (req: Request, res: Response, next: NextFunction) {
    hb.log('Homebridge restart request received');
    res.status(202).json({ ok: true, command: hb.restartCmd });

    setTimeout(() => {
      if (hb.restartCmd) {
        hb.log(`Executing restart command: ${hb.restartCmd}`);
        child_process.exec(hb.restartCmd, (err) => {
          if (err) {
            hb.log('Restart command exited with an error. Failed to restart Homebridge.');
          }
        });
      } else if (hb.restartCmd !== false) {
        hb.log(`No restart command defined, killing process...`);
        process.exit(1);
      }
    }, 100);
  }

  getQrCode (req: Request, res: Response, next: NextFunction) {
    const data = qrcode.getCode();

    if (!data) {
      return res.sendStatus(404);
    }

    const qrSvg = qr.image(data, { type: 'svg' });
    res.setHeader('Content-type', 'image/svg+xml');
    qrSvg.pipe(res);
  }

  getToken (req: Request, res: Response, next: NextFunction) {
    return res.json({
      token: users.getJwt(req.user)
    });
  }
}
