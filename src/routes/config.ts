import { Router, Request, Response, NextFunction } from 'express';

import { hb } from '../hb';

export class ConfigRouter {
  public router: Router;

  constructor() {
    this.router = Router();

    this.router.get('/', this.getConfig);
    this.router.post('/', this.updateConfig);
  }

  getConfig(req: Request, res: Response, next: NextFunction) {
    return res.sendFile(hb.configPath);
  }

  updateConfig(req: Request, res: Response, next: NextFunction) {
    return hb.updateConfig(req.body)
      .then((config) => {
        res.json(config);
      })
      .catch(next);
  }
}
