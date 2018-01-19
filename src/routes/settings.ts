import { Router, Request, Response, NextFunction } from 'express';

import { hb } from '../hb';

export class SettingsRouter {
  public router: Router;

  constructor() {
    this.router = Router();

    this.router.get('/', this.getSettings);
  }

  getSettings (req: Request, res: Response, next: NextFunction) {
    res.json({
      formAuth: hb.formAuth
    });
  }
}
