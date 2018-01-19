import * as fs from 'fs';
import { Router, Request, Response, NextFunction } from 'express';

import { hb } from '../hb';

export class ConfigRouter {
  public router: Router;

  constructor() {
    this.router = Router();

    this.router.get('/', this.getConfig);
    this.router.post('/', this.updateConfig);
  }

  getConfig (req: Request, res: Response, next: NextFunction) {
    res.sendFile(hb.configPath);
  }

  updateConfig (req: Request, res: Response, next: NextFunction) {
    const config = req.body;
    const now = new Date();

    // create backup of existing config
    fs.renameSync(hb.configPath, `${hb.configPath}.${now.getTime()}`);

    // write new config
    fs.appendFileSync(hb.configPath, JSON.stringify(config, null, 4));

    delete require.cache[require.resolve(hb.configPath)];

    hb.log('Configuration Changes Saved');

    res.json({ ok: true });
  }
}
