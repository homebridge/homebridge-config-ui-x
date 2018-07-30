import { Router, Request, Response, NextFunction } from 'express';

import { hb } from '../hb';

export class BackupRouter {
  public router: Router;

  constructor() {
    this.router = Router();
    this.router.get('/', this.downloadConfig);
  }

  downloadConfig(req: Request, res: Response, next: NextFunction) {
    res.set('content-disposition', 'attachment; filename=config.json');
    res.header('content-type', 'application/json');
    return res.sendFile(hb.configPath);
  }
}
