import { Router, Request, Response, NextFunction } from 'express';

import { hb } from '../hb';

export class SettingsRouter {
  public router: Router;

  constructor() {
    this.router = Router();

    this.router.get('/', this.getSettings);
  }

  getSettings(req: Request, res: Response, next: NextFunction) {
    return res.json({
      formAuth: hb.formAuth,
      theme: hb.theme,
      env: {
        packageName: hb.ui.name,
        packageVersion: hb.ui.version,
        nodeVersion: process.version,
        enableAccessories: hb.homebridgeInsecure || false,
        homebridgeInstanceName: hb.homebridgeConfig.bridge.name || 'Homebridge',
        runningInDocker: hb.runningInDocker,
        runningInLinux: hb.runningInLinux,
        ableToConfigureSelf: hb.ableToConfigureSelf
      }
    });
  }
}
